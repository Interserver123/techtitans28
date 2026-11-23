-- =============================================================================
-- LIVE TOP 3 (Super Admin only)
--
-- compute_tally() stays sealed until the election closes. This separate function lets
-- a Super Admin (live session, MFA) see the current top three candidates per position
-- while voting is open. Only VALID ballots count; rank ties share a rank.
-- =============================================================================
create or replace function admin_live_top3(p_session_hash text, p_election_id uuid)
returns table (position_id uuid, position_code text, position_gender text, position_order integer,
               candidate_id uuid, display_name text, roll_number text, votes integer, rank integer)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
begin
  perform session_admin(p_session_hash, 'SUPER_ADMIN', null);
  return query
    with t as (
      select p.id as pid, p.code as pcode, p.gender::text as pgender, p.display_order as pord,
             c.id as cid, c.display_name as cname, s.roll_number as roll,
             (count(b.id) filter (where b.status = 'VALID'))::int as v, c.display_order as cord
        from candidates c
        join students s on s.id = c.student_id
        join election_positions p on p.id = c.position_id
        left join ballots b on b.candidate_id = c.id and b.election_id = c.election_id
       where c.election_id = p_election_id and c.status = 'APPROVED'
       group by c.id, c.display_name, s.roll_number, c.display_order, p.id, p.code, p.gender, p.display_order
    ), r as (
      select t.*, (rank() over (partition by t.pid order by t.v desc))::int as rk,
             row_number() over (partition by t.pid order by t.v desc, t.cord, t.cname) as rn
        from t
    )
    select r.pid, r.pcode, r.pgender, r.pord, r.cid, r.cname, r.roll, r.v, r.rk
      from r where r.rn <= 3
     order by r.pord, r.pcode, r.rn;
end $$;

revoke all on function admin_live_top3(text, uuid) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function admin_live_top3(text, uuid) from %I', r);
    end if;
  end loop;
  grant execute on function admin_live_top3(text, uuid) to techtitans_app;
end $$;
