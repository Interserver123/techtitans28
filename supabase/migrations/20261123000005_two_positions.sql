-- =============================================================================
-- Two races per election: Boys' CR and Girls' CR.
--
-- STRICT RULE (enforced here, in the database): every voter casts exactly one
-- vote in EACH position of the election — one for a boy, one for a girl — in a
-- single atomic submission. Voting for only one race, twice in the same race,
-- or for a candidate of the wrong gender is rejected.
--
-- Ballot confidentiality is unchanged: ballots still carry no voter reference.
-- A voter now produces one anonymous ballot row per position.
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Gender on students and positions
-- ---------------------------------------------------------------------------
alter table students add column if not exists gender text;
alter table students drop constraint if exists students_gender_check;
alter table students add constraint students_gender_check check (gender is null or gender in ('MALE', 'FEMALE'));
create index if not exists idx_students_gender on students(gender);

alter table election_positions add column if not exists gender text;
alter table election_positions drop constraint if exists election_positions_gender_check;
alter table election_positions add constraint election_positions_gender_check check (gender is null or gender in ('MALE', 'FEMALE'));

-- A candidate may only run in the race that matches their gender.
create or replace function enforce_candidate_gender() returns trigger
language plpgsql
set search_path = public, extensions, pg_temp as $$
declare
  pg text;
  sg text;
begin
  select gender into pg from election_positions where id = new.position_id;
  if pg is not null then
    select gender into sg from students where id = new.student_id;
    if sg is distinct from pg then
      raise exception 'GENDER_MISMATCH: this candidate''s gender (%) does not match the race (%)', coalesce(sg, 'not set'), pg using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_candidate_gender on candidates;
create trigger trg_candidate_gender before insert or update of student_id, position_id on candidates
  for each row execute function enforce_candidate_gender();

-- A student's gender cannot be changed while they are a candidate.
create or replace function enforce_student_gender_lock() returns trigger
language plpgsql
set search_path = public, extensions, pg_temp as $$
begin
  if new.gender is distinct from old.gender and exists (select 1 from candidates where student_id = old.id) then
    raise exception 'GENDER_MISMATCH: remove this student from the candidate list before changing their gender' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_student_gender_lock on students;
create trigger trg_student_gender_lock before update of gender on students
  for each row execute function enforce_student_gender_lock();

-- An election can only be scheduled when every position has an approved candidate.
create or replace function enforce_schedule_requirements() returns trigger
language plpgsql
set search_path = public, extensions, pg_temp as $$
begin
  if new.status = 'SCHEDULED' and old.status <> 'SCHEDULED' then
    if not exists (select 1 from election_positions where election_id = new.id) then
      raise exception 'INVALID_STATE: the election has no positions' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from election_positions p
       where p.election_id = new.id
         and not exists (select 1 from candidates c where c.position_id = p.id and c.status = 'APPROVED')
    ) then
      raise exception 'INVALID_STATE: every position (Boys'' CR and Girls'' CR) needs at least one approved candidate before scheduling' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_election_schedule_requirements on elections;
create trigger trg_election_schedule_requirements before update on elections
  for each row execute function enforce_schedule_requirements();

-- ---------------------------------------------------------------------------
-- THE BALLOT TRANSACTION (replaces the single-choice version)
-- ---------------------------------------------------------------------------
drop function if exists cast_ballot(text, uuid);

create or replace function cast_ballot(p_token_hash text, p_candidate_ids uuid[])
returns table (receipt_code text, voted_at timestamptz)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_cred      voter_credentials%rowtype;
  v_el        elections%rowtype;
  v_st        students%rowtype;
  v_positions integer;
  v_chosen    integer;
  v_distinct  integer;
  v_receipt   text;
  v_time      timestamptz;
  r           record;
begin
  select * into v_cred from voter_credentials c
   where c.token_hash = p_token_hash and c.revoked_at is null and c.expires_at > now();
  if v_cred.id is null then
    raise exception 'SESSION_INVALID' using errcode = 'P0001';
  end if;

  select * into v_el from elections where id = v_cred.election_id for share;
  if v_el.status = 'PAUSED' then
    raise exception 'ELECTION_PAUSED' using errcode = 'P0001';
  end if;
  if now() >= v_el.closes_at or v_el.status in ('CLOSED', 'RESULTS_PUBLISHED') then
    raise exception 'ELECTION_CLOSED' using errcode = 'P0001';
  end if;
  if not (v_el.status = 'LIVE' or (v_el.status = 'SCHEDULED' and now() >= v_el.opens_at)) then
    raise exception 'ELECTION_NOT_OPEN' using errcode = 'P0001';
  end if;

  select * into v_st from students where id = v_cred.student_id for update;
  if v_st.id is null or not v_st.is_active or not v_st.is_eligible
     or v_st.batch <> setting_text('election.batch', 'TechTitans-28') then
    raise exception 'NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  if exists (select 1 from voter_participation p where p.election_id = v_el.id and p.student_id = v_st.id) then
    raise exception 'ALREADY_VOTED' using errcode = 'P0001';
  end if;

  -- Exactly one choice per position — no more, no fewer, none repeated.
  select count(*) into v_positions from election_positions where election_id = v_el.id;
  if v_positions = 0 then
    raise exception 'INVALID_STATE: the election has no positions' using errcode = 'P0001';
  end if;
  if p_candidate_ids is null or cardinality(p_candidate_ids) <> v_positions
     or (select count(distinct x) from unnest(p_candidate_ids) as x) <> v_positions then
    raise exception 'INCOMPLETE_BALLOT' using errcode = 'P0001';
  end if;

  select count(*), count(distinct c.position_id) into v_chosen, v_distinct
    from candidates c
   where c.id = any (p_candidate_ids) and c.election_id = v_el.id and c.status = 'APPROVED';
  if v_chosen <> v_positions then
    raise exception 'INVALID_CANDIDATE' using errcode = 'P0001';
  end if;
  if v_distinct <> v_positions then
    raise exception 'INCOMPLETE_BALLOT' using errcode = 'P0001';
  end if;
  -- Safety net on top of the candidate trigger: gender must match the race.
  if exists (
    select 1 from candidates c
      join election_positions p on p.id = c.position_id
      join students s on s.id = c.student_id
     where c.id = any (p_candidate_ids) and p.gender is not null and s.gender is distinct from p.gender
  ) then
    raise exception 'INVALID_CANDIDATE' using errcode = 'P0001';
  end if;

  v_receipt := 'TT28-' || random_code(4) || '-' || random_code(4) || '-' || random_code(4);
  begin
    insert into voter_participation (election_id, student_id, receipt_code)
    values (v_el.id, v_st.id, v_receipt)
    returning voter_participation.voted_at into v_time;
  exception when unique_violation then
    raise exception 'ALREADY_VOTED' using errcode = 'P0001';
  end;

  -- One anonymous ballot row per position (random order, no voter reference, no timestamp).
  for r in
    select c.id as cid, c.position_id as pid from candidates c where c.id = any (p_candidate_ids) order by random()
  loop
    insert into ballots (election_id, position_id, candidate_id, ballot_ref)
    values (v_el.id, r.pid, r.cid, 'B-' || upper(encode(gen_random_bytes(8), 'hex')));
  end loop;

  receipt_code := v_receipt;
  voted_at := v_time;
  return next;
end $$;

-- ---------------------------------------------------------------------------
-- Totals and tallies, now per position
-- ---------------------------------------------------------------------------
drop function if exists ballot_totals(uuid);
create function ballot_totals(p_election_id uuid)
returns table (total_ballots integer, valid_ballots integer, invalidated_ballots integer, participation integer, positions integer)
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select
    (select count(*)::int from ballots where election_id = p_election_id),
    (select count(*)::int from ballots where election_id = p_election_id and status = 'VALID'),
    (select count(*)::int from ballots where election_id = p_election_id and status = 'INVALIDATED'),
    (select count(*)::int from voter_participation where election_id = p_election_id),
    (select count(*)::int from election_positions where election_id = p_election_id);
$$;

create or replace function ballot_totals_by_position(p_election_id uuid)
returns table (position_id uuid, code text, title text, gender text, display_order integer,
               total_ballots integer, valid_ballots integer, invalidated_ballots integer)
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select p.id, p.code, p.title, p.gender, p.display_order,
         count(b.id)::int,
         (count(b.id) filter (where b.status = 'VALID'))::int,
         (count(b.id) filter (where b.status = 'INVALIDATED'))::int
    from election_positions p
    left join ballots b on b.position_id = p.id and b.election_id = p.election_id
   where p.election_id = p_election_id
   group by p.id, p.code, p.title, p.gender, p.display_order
   order by p.display_order, p.code;
$$;

drop function if exists compute_tally(uuid);
create function compute_tally(p_election_id uuid)
returns table (candidate_id uuid, display_name text, roll_number text, votes integer, rank integer,
               position_id uuid, position_code text, position_title text, position_gender text, position_order integer)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  st election_status;
begin
  select e.status into st from elections e where e.id = p_election_id;
  if st is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if st not in ('CLOSED', 'RESULTS_PUBLISHED') then
    raise exception 'RESULTS_SEALED: candidate-wise results are sealed until the election closes' using errcode = 'P0001';
  end if;
  return query
    select c.id, c.display_name, s.roll_number,
           (count(b.id) filter (where b.status = 'VALID'))::int as votes,
           (rank() over (partition by p.id order by count(b.id) filter (where b.status = 'VALID') desc))::int as rank,
           p.id, p.code, p.title, p.gender, p.display_order
      from candidates c
      join students s on s.id = c.student_id
      join election_positions p on p.id = c.position_id
      left join ballots b on b.candidate_id = c.id and b.election_id = c.election_id
     where c.election_id = p_election_id
       and (c.status = 'APPROVED' or b.id is not null)
     group by c.id, c.display_name, s.roll_number, c.display_order, p.id, p.code, p.title, p.gender, p.display_order
     order by p.display_order, p.code, votes desc, c.display_order, c.display_name;
end $$;

create or replace function tally_hash(p_election_id uuid) returns text
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_rows text;
  v_tot record;
  v_corr text;
begin
  select string_agg(t.candidate_id::text || ':' || t.votes::text, ',' order by t.candidate_id) into v_rows
    from compute_tally(p_election_id) t;
  select * into v_tot from ballot_totals(p_election_id);
  select coalesce(string_agg(id::text || ':' || status::text, ',' order by id), '') into v_corr
    from correction_requests where election_id = p_election_id and status = 'APPROVED';
  return encode(digest(coalesce(v_rows, '') || '|' || v_tot.total_ballots || '|' || v_tot.valid_ballots || '|'
                       || v_tot.participation || '|' || v_tot.positions || '|' || v_corr, 'sha256'), 'hex');
end $$;

drop function if exists ballot_ledger(uuid);
create function ballot_ledger(p_election_id uuid)
returns table (ballot_id uuid, ballot_ref text, candidate_id uuid, candidate_name text, status ballot_status, last_correction_id uuid,
               position_id uuid, position_title text, position_gender text)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  st election_status;
begin
  select e.status into st from elections e where e.id = p_election_id;
  if st is null or st not in ('CLOSED', 'RESULTS_PUBLISHED') then
    raise exception 'RESULTS_SEALED: the ballot ledger is sealed until the election closes' using errcode = 'P0001';
  end if;
  return query
    select b.id, b.ballot_ref, b.candidate_id, c.display_name, b.status, b.last_correction_id,
           p.id, p.title, p.gender
      from ballots b
      join candidates c on c.id = b.candidate_id
      join election_positions p on p.id = b.position_id
     where b.election_id = p_election_id
     order by b.ballot_ref;
end $$;

-- ---------------------------------------------------------------------------
-- Verification and publication, per position
-- ---------------------------------------------------------------------------
create or replace function verify_results(p_election_id uuid, p_admin_id uuid, p_ip_hash text) returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  st election_status;
  v_hash text;
  v_tot record;
  v_bad text;
begin
  if not admin_has_permission(p_admin_id, 'results.verify') then
    raise exception 'FORBIDDEN: results.verify required' using errcode = 'P0001';
  end if;
  select status into st from elections where id = p_election_id for update;
  if st is distinct from 'CLOSED' then
    raise exception 'INVALID_STATE: results can only be verified for a closed, unpublished election' using errcode = 'P0001';
  end if;
  if exists (select 1 from correction_requests where election_id = p_election_id and status = 'PENDING') then
    raise exception 'INVALID_STATE: resolve pending correction requests before verification' using errcode = 'P0001';
  end if;
  select * into v_tot from ballot_totals(p_election_id);
  -- Every voter must have exactly one ballot in EVERY position.
  select string_agg(t.title || ': ' || t.total_ballots || ' ballots vs ' || v_tot.participation || ' voters', '; ') into v_bad
    from ballot_totals_by_position(p_election_id) t
   where t.total_ballots <> v_tot.participation;
  if v_bad is not null then
    raise exception 'RECONCILIATION_FAILED: %', v_bad using errcode = 'P0001';
  end if;
  v_hash := tally_hash(p_election_id);
  update elections set results_verified_at = now(), results_verified_by = p_admin_id, results_verified_hash = v_hash
   where id = p_election_id;
  perform append_audit('ADMIN', p_admin_id, 'RESULTS.VERIFIED', 'election', p_election_id::text,
    jsonb_build_object('tally_hash', v_hash, 'voters', v_tot.participation, 'positions', v_tot.positions,
                       'total_ballots', v_tot.total_ballots, 'valid_ballots', v_tot.valid_ballots), p_ip_hash);
  return v_hash;
end $$;

create or replace function publish_results(p_election_id uuid, p_admin_id uuid, p_note text, p_ip_hash text)
returns table (candidate_id uuid, vote_count integer, rank integer, is_winner boolean, is_tied boolean)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  e elections%rowtype;
  v_hash text;
  v_tie boolean;
begin
  if not admin_has_permission(p_admin_id, 'results.publish') then
    raise exception 'FORBIDDEN: results.publish required' using errcode = 'P0001';
  end if;
  select * into e from elections where id = p_election_id for update;
  if e.status is distinct from 'CLOSED' then
    raise exception 'INVALID_STATE: only a closed election can be published' using errcode = 'P0001';
  end if;
  if e.results_verified_hash is null then
    raise exception 'INVALID_STATE: results must be verified before publication' using errcode = 'P0001';
  end if;
  v_hash := tally_hash(p_election_id);
  if v_hash <> e.results_verified_hash then
    raise exception 'INVALID_STATE: tally changed since verification; verify again' using errcode = 'P0001';
  end if;

  -- A tie for first place in ANY position needs the committee's written resolution.
  select exists (
    select 1 from (
      select t.votes,
             max(t.votes) over (partition by t.position_id) as mx,
             count(*) over (partition by t.position_id, t.votes) as n
        from compute_tally(p_election_id) t
    ) z where z.votes = z.mx and z.mx > 0 and z.n > 1
  ) into v_tie;
  if v_tie and (p_note is null or length(btrim(p_note)) < 10) then
    raise exception 'TIE_NOTE_REQUIRED: a position is tied; record the committee tie-resolution note' using errcode = 'P0001';
  end if;

  with t as materialized (select * from compute_tally(p_election_id)),
       m as (select x.position_id, max(x.votes) as top from t x group by x.position_id),
       c as (select x.position_id, count(*) as n from t x join m on m.position_id = x.position_id and x.votes = m.top group by x.position_id)
  insert into election_results (election_id, candidate_id, vote_count, rank, is_winner, is_tied)
  select p_election_id, t.candidate_id, t.votes, t.rank,
         (t.votes = m.top and c.n = 1 and m.top > 0),
         (t.votes = m.top and c.n > 1 and m.top > 0)
    from t join m on m.position_id = t.position_id join c on c.position_id = t.position_id;

  update elections
     set status = 'RESULTS_PUBLISHED', results_published_at = now(), results_published_by = p_admin_id,
         result_note = nullif(btrim(coalesce(p_note, '')), ''),
         eligible_snapshot = coalesce(eligible_snapshot, eligible_voter_count())
   where id = p_election_id;

  perform append_audit('ADMIN', p_admin_id, 'RESULTS.PUBLISHED', 'election', p_election_id::text,
    jsonb_build_object('tally_hash', v_hash, 'tied', v_tie), p_ip_hash);

  return query select r.candidate_id, r.vote_count, r.rank, r.is_winner, r.is_tied
                 from election_results r where r.election_id = p_election_id order by r.rank;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges for the new / recreated functions
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
  r text;
begin
  foreach f in array array[
    'cast_ballot(text, uuid[])', 'ballot_totals(uuid)', 'ballot_totals_by_position(uuid)', 'compute_tally(uuid)',
    'tally_hash(uuid)', 'ballot_ledger(uuid)', 'verify_results(uuid, uuid, text)', 'publish_results(uuid, uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on function %s from %I', f, r);
      end if;
    end loop;
    execute format('grant execute on function %s to techtitans_app', f);
  end loop;
end $$;

-- students.gender is read by the application role like the other student columns.
grant select, insert, update on students to techtitans_app;
