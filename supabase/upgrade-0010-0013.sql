-- =============================================================================
-- TechTitans-28 — UPGRADE ONLY: migrations 0010–0013
--   0010 live top 3 (Super Admin)  ·  0011 vote change at the voter's request
--   0012/0013 (0012's cancel-vote function is removed again by 0013)
-- Copied verbatim from supabase/deploy.sql (same checksum guards), for databases
-- that already have migration 0009. Safe while voting is live: it only adds
-- columns, constraints and functions; it never changes or deletes existing votes.
-- Running it twice does nothing. If 0009 is missing, use deploy.sql instead.
--
-- HOW TO USE: Supabase → SQL Editor → New query → paste this file → Run.
-- =============================================================================

begin;

do $tt_check$
begin
  if not exists (select 1 from public.schema_migrations where filename = '20261123000009_admin_controls.sql') then
    raise exception 'This database is missing migration 0009. Run supabase/deploy.sql instead.';
  end if;
end $tt_check$;

-- ---------------------------------------------------------------------------
-- 20261123000010_live_top3.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000010_live_top3.sql';
  if prev is null then
    execute $tt_migration_10$-- =============================================================================
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
$tt_migration_10$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000010_live_top3.sql', 'd23b47c5d1b096a2cf49f063a4c86382faa18b18ad2b91b81f6fb04d3c8c0e3f');
    raise notice 'applied 20261123000010_live_top3.sql';
  elsif prev <> 'd23b47c5d1b096a2cf49f063a4c86382faa18b18ad2b91b81f6fb04d3c8c0e3f' then
    raise exception 'Migration 20261123000010_live_top3.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261124000011_voter_requested_change.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261124000011_voter_requested_change.sql';
  if prev is null then
    execute $tt_migration_11$-- =============================================================================
-- VOTE CHANGE AT THE VOTER'S OWN REQUEST
--
-- A voter cannot change their ballot themselves. If they ask the committee (e.g. on
-- Facebook or in person), ONE Super Admin with a fresh authenticator code can record
-- the change while voting is live or paused, or after it closes (before results are
-- published). It reuses the correction machinery, so nothing is edited or deleted:
-- the current ballot is marked INVALIDATED and a linked replacement ballot is added.
-- The correction row is flagged voter_requested, names how the voter asked, is
-- approved by the same Super Admin, and is written to the audit log. The voter sees
-- the change on their receipt page. Every other correction still needs two people.
-- =============================================================================
set search_path = public, extensions;

alter table correction_requests add column if not exists voter_requested boolean not null default false;
alter table correction_requests add column if not exists request_channel text;
alter table correction_requests drop constraint if exists request_channel_len;
alter table correction_requests add constraint request_channel_len
  check (request_channel is null or length(btrim(request_channel)) between 2 and 200);
alter table correction_requests drop constraint if exists voter_request_shape;
alter table correction_requests add constraint voter_request_shape
  check (not voter_requested or (correction::text = 'REPLACE_CHOICE' and request_channel is not null));
-- Same-person review is allowed only for a voter-requested change.
alter table correction_requests drop constraint if exists second_person_review;
alter table correction_requests add constraint second_person_review
  check (reviewed_by is null or reviewed_by <> requested_by or voter_requested);

-- The application role may not set the new columns itself (only the function below does).
revoke insert on correction_requests from techtitans_app;
grant insert (election_id, ballot_id, correction, reason, evidence_note, evidence_path, requested_by, new_candidate_id)
  on correction_requests to techtitans_app;

create or replace function enforce_correction_immutability() returns trigger
language plpgsql as $$
begin
  if old.status <> 'PENDING' then
    raise exception 'IMMUTABLE: correction % is already %', old.id, old.status using errcode = 'P0001';
  end if;
  if new.reason is distinct from old.reason or new.ballot_id is distinct from old.ballot_id
     or new.correction is distinct from old.correction or new.requested_by is distinct from old.requested_by
     or new.requested_at is distinct from old.requested_at or new.election_id is distinct from old.election_id
     or new.new_candidate_id is distinct from old.new_candidate_id
     or new.voter_requested is distinct from old.voter_requested or new.request_channel is distinct from old.request_channel
     or new.evidence_note is distinct from old.evidence_note or new.evidence_path is distinct from old.evidence_path then
    raise exception 'IMMUTABLE: correction request content cannot be edited' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function change_vote_on_voter_request(
  p_session_hash text, p_election_id uuid, p_student_id uuid, p_position_id uuid, p_new_candidate_id uuid,
  p_channel text, p_reason text, p_ip_hash text
) returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_admin uuid;
  st election_status;
  vc voter_choices%rowtype;
  hb ballots%rowtype;
  pg text;
  sg text;
  v_id uuid;
  v_ref text;
begin
  v_admin := session_admin(p_session_hash, 'SUPER_ADMIN', 10);
  if p_reason is null or length(btrim(p_reason)) < 20 then
    raise exception 'VALIDATION: explain the reason in at least 20 characters' using errcode = 'P0001';
  end if;
  if p_channel is null or length(btrim(p_channel)) < 2 then
    raise exception 'VALIDATION: say how the voter asked for the change' using errcode = 'P0001';
  end if;
  select e.status into st from elections e where e.id = p_election_id for update;
  if st is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if st not in ('LIVE', 'PAUSED', 'CLOSED') then
    raise exception 'ELECTION_LOCKED: a vote can be changed only while voting is open or paused, or after it closes and before results are published' using errcode = 'P0001';
  end if;
  select * into vc from voter_choices v
   where v.election_id = p_election_id and v.student_id = p_student_id and v.position_id = p_position_id;
  if vc.id is null then
    raise exception 'INVALID_STATE: this vote was cast anonymously (before the open-ballot notice) or does not exist' using errcode = 'P0001';
  end if;
  select * into hb from ballots where id = ballot_chain_head((select id from ballots where ballot_ref = vc.ballot_ref)) for update;
  if hb.status <> 'VALID' then
    raise exception 'INVALID_STATE: this vote is currently invalidated; reinstate it first' using errcode = 'P0001';
  end if;
  if hb.candidate_id = p_new_candidate_id then
    raise exception 'INVALID_STATE: the vote is already for this candidate' using errcode = 'P0001';
  end if;
  if not exists (select 1 from candidates c where c.id = p_new_candidate_id and c.election_id = p_election_id
                    and c.position_id = p_position_id and c.status = 'APPROVED') then
    raise exception 'INVALID_CANDIDATE' using errcode = 'P0001';
  end if;
  select p.gender into pg from election_positions p where p.id = p_position_id;
  if pg is not null then
    select s.gender into sg from candidates c join students s on s.id = c.student_id where c.id = p_new_candidate_id;
    if sg is distinct from pg then
      raise exception 'GENDER_MISMATCH' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into correction_requests (election_id, ballot_id, correction, reason, requested_by, new_candidate_id, voter_requested, request_channel)
    values (p_election_id, hb.id, 'REPLACE_CHOICE', btrim(p_reason), v_admin, p_new_candidate_id, true, btrim(p_channel))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CONFLICT: a correction for this vote is already pending' using errcode = 'P0001';
  end;
  update correction_requests
     set status = 'APPROVED', reviewed_by = v_admin, reviewed_at = now(),
         review_note = 'Voter-requested change, recorded by one Super Admin', ballot_status_before = hb.status
   where id = v_id;
  update ballots set status = 'INVALIDATED', last_correction_id = v_id where id = hb.id;
  v_ref := 'B-' || upper(encode(gen_random_bytes(8), 'hex'));
  insert into ballots (election_id, position_id, candidate_id, ballot_ref, replaces_ballot_id, created_by_correction_id)
  values (hb.election_id, hb.position_id, p_new_candidate_id, v_ref, hb.id, v_id);
  update elections set results_verified_at = null, results_verified_by = null, results_verified_hash = null
   where id = p_election_id;

  -- Like other corrections: ballot references and candidates, never the voter.
  perform append_audit('ADMIN', v_admin, 'CORRECTION.VOTER_REQUESTED', 'correction_request', v_id::text,
    jsonb_build_object('ballot_ref', hb.ballot_ref, 'replacement_ballot_ref', v_ref, 'correction', 'REPLACE_CHOICE',
                       'channel', btrim(p_channel), 'reason', btrim(p_reason), 'election_status', st,
                       'from_candidate', (select display_name from candidates where id = hb.candidate_id),
                       'to_candidate', (select display_name from candidates where id = p_new_candidate_id)),
    p_ip_hash);
  return v_id;
end $$;

revoke all on function change_vote_on_voter_request(text, uuid, uuid, uuid, uuid, text, text, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function change_vote_on_voter_request(text, uuid, uuid, uuid, uuid, text, text, text) from %I', r);
    end if;
  end loop;
  grant execute on function change_vote_on_voter_request(text, uuid, uuid, uuid, uuid, text, text, text) to techtitans_app;
end $$;
$tt_migration_11$;
    insert into public.schema_migrations (filename, checksum) values ('20261124000011_voter_requested_change.sql', '84274749684e71816e5328b8df5094186df1b58a84661a159bbee04fbf098894');
    raise notice 'applied 20261124000011_voter_requested_change.sql';
  elsif prev <> '84274749684e71816e5328b8df5094186df1b58a84661a159bbee04fbf098894' then
    raise exception 'Migration 20261124000011_voter_requested_change.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261124000012_cancel_vote.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261124000012_cancel_vote.sql';
  if prev is null then
    execute $tt_migration_12$-- =============================================================================
-- CANCEL A VOTER'S VOTE (one Super Admin)
--
-- For a vote cast by mistake: ONE Super Admin with a fresh authenticator code can
-- cancel all of a voter's current ballots while voting is live or paused, or after
-- it closes (before results are published). Nothing is deleted: each current ballot
-- is marked INVALIDATED through an approved INVALIDATE_BALLOT correction flagged
-- voter_requested (single Super Admin), with how the request came and why, and the
-- audit log records it. The voter stays marked as having voted and cannot vote again.
-- =============================================================================
set search_path = public, extensions;

alter table correction_requests drop constraint if exists voter_request_shape;
alter table correction_requests add constraint voter_request_shape
  check (not voter_requested or (correction::text in ('REPLACE_CHOICE', 'INVALIDATE_BALLOT') and request_channel is not null));

create or replace function cancel_vote_on_request(
  p_session_hash text, p_election_id uuid, p_student_id uuid, p_channel text, p_reason text, p_ip_hash text
) returns integer
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_admin uuid;
  st election_status;
  vc record;
  hb ballots%rowtype;
  v_id uuid;
  v_n integer := 0;
  v_refs jsonb := '[]'::jsonb;
begin
  v_admin := session_admin(p_session_hash, 'SUPER_ADMIN', 10);
  if p_reason is null or length(btrim(p_reason)) < 20 then
    raise exception 'VALIDATION: explain the reason in at least 20 characters' using errcode = 'P0001';
  end if;
  if p_channel is null or length(btrim(p_channel)) < 2 then
    raise exception 'VALIDATION: say how the cancellation was requested' using errcode = 'P0001';
  end if;
  select e.status into st from elections e where e.id = p_election_id for update;
  if st is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if st not in ('LIVE', 'PAUSED', 'CLOSED') then
    raise exception 'ELECTION_LOCKED: a vote can be cancelled only while voting is open or paused, or after it closes and before results are published' using errcode = 'P0001';
  end if;
  if not exists (select 1 from voter_choices v where v.election_id = p_election_id and v.student_id = p_student_id) then
    raise exception 'INVALID_STATE: this vote was cast anonymously (before the open-ballot notice) or does not exist' using errcode = 'P0001';
  end if;

  for vc in select v.ballot_ref from voter_choices v
             where v.election_id = p_election_id and v.student_id = p_student_id order by v.position_id loop
    select * into hb from ballots where id = ballot_chain_head((select id from ballots where ballot_ref = vc.ballot_ref)) for update;
    continue when hb.status <> 'VALID';
    begin
      insert into correction_requests (election_id, ballot_id, correction, reason, requested_by, voter_requested, request_channel)
      values (p_election_id, hb.id, 'INVALIDATE_BALLOT', btrim(p_reason), v_admin, true, btrim(p_channel))
      returning id into v_id;
    exception when unique_violation then
      raise exception 'CONFLICT: a correction for this vote is already pending' using errcode = 'P0001';
    end;
    update correction_requests
       set status = 'APPROVED', reviewed_by = v_admin, reviewed_at = now(),
           review_note = 'Vote cancelled by one Super Admin', ballot_status_before = hb.status
     where id = v_id;
    update ballots set status = 'INVALIDATED', last_correction_id = v_id where id = hb.id;
    v_n := v_n + 1;
    v_refs := v_refs || jsonb_build_object('ballot_ref', hb.ballot_ref, 'candidate', (select display_name from candidates where id = hb.candidate_id));
  end loop;
  if v_n = 0 then
    raise exception 'INVALID_STATE: this vote is already cancelled' using errcode = 'P0001';
  end if;
  update elections set results_verified_at = null, results_verified_by = null, results_verified_hash = null
   where id = p_election_id;
  -- Ballot references and candidates, never the voter (as for other corrections).
  perform append_audit('ADMIN', v_admin, 'CORRECTION.VOTE_CANCELLED', 'election', p_election_id::text,
    jsonb_build_object('ballots', v_refs, 'channel', btrim(p_channel), 'reason', btrim(p_reason), 'election_status', st),
    p_ip_hash);
  return v_n;
end $$;

revoke all on function cancel_vote_on_request(text, uuid, uuid, text, text, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function cancel_vote_on_request(text, uuid, uuid, text, text, text) from %I', r);
    end if;
  end loop;
  grant execute on function cancel_vote_on_request(text, uuid, uuid, text, text, text) to techtitans_app;
end $$;
$tt_migration_12$;
    insert into public.schema_migrations (filename, checksum) values ('20261124000012_cancel_vote.sql', 'd593c948c988433d186ae156c5c1b7e889ae09ffda035736116a3cc8cb6fc473');
    raise notice 'applied 20261124000012_cancel_vote.sql';
  elsif prev <> 'd593c948c988433d186ae156c5c1b7e889ae09ffda035736116a3cc8cb6fc473' then
    raise exception 'Migration 20261124000012_cancel_vote.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261124000013_remove_cancel_vote.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261124000013_remove_cancel_vote.sql';
  if prev is null then
    execute $tt_migration_13$-- =============================================================================
-- REMOVE THE ONE-PERSON "CANCEL VOTE" OPTION (added in 0012)
--
-- The committee decided not to offer it. The function is dropped, and a
-- one-Super-Admin correction is again allowed only for a vote change the voter
-- asked for (REPLACE_CHOICE). Any correction already recorded stays as it is
-- (NOT VALID only checks new rows): nothing is edited or deleted.
-- =============================================================================
set search_path = public, extensions;

drop function if exists cancel_vote_on_request(text, uuid, uuid, text, text, text);

alter table correction_requests drop constraint if exists voter_request_shape;
alter table correction_requests add constraint voter_request_shape
  check (not voter_requested or (correction::text = 'REPLACE_CHOICE' and request_channel is not null)) not valid;
$tt_migration_13$;
    insert into public.schema_migrations (filename, checksum) values ('20261124000013_remove_cancel_vote.sql', '786e58a291beef8cd17b4389f13feadb6cc0c3ea59dd7c519724c04f8eabd722');
    raise notice 'applied 20261124000013_remove_cancel_vote.sql';
  elsif prev <> '786e58a291beef8cd17b4389f13feadb6cc0c3ea59dd7c519724c04f8eabd722' then
    raise exception 'Migration 20261124000013_remove_cancel_vote.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

commit;

select filename, applied_at from public.schema_migrations order by filename desc limit 5;
