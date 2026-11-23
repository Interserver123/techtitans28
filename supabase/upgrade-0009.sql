-- =============================================================================
-- TechTitans-28 — UPGRADE ONLY: migration 0009 (admin controls)
-- Copied verbatim from supabase/deploy.sql (same checksum guard), for databases
-- that already have migrations 0001–0008. Safe while voting is live: it only
-- adds columns, triggers and functions; it never touches existing votes.
-- Running it twice does nothing. If 0001–0008 are missing, use deploy.sql.
--
-- HOW TO USE: Supabase → SQL Editor → New query → paste this file → Run.
-- =============================================================================

begin;

do $tt_check$
begin
  if not exists (select 1 from public.schema_migrations where filename = '20261123000008_open_ballot.sql') then
    raise exception 'This database is missing migration 0008. Run supabase/deploy.sql instead.';
  end if;
end $tt_check$;

-- ---------------------------------------------------------------------------
-- 20261123000009_admin_controls.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000009_admin_controls.sql';
  if prev is null then
    execute $tt_migration_9$-- =============================================================================
-- PRIVILEGED ADMINISTRATIVE CONTROLS
--
-- 1. No silent ballot modification. The single-person admin_change_vote() from
--    migration 0008 is removed. A vote can only be changed through a REPLACE_CHOICE
--    correction request that a DIFFERENT Super Admin approves, after voting closes
--    and before results are published. On approval the original ballot row is kept
--    unchanged except for its status (INVALIDATED), and a NEW replacement ballot is
--    inserted that points back to it. Nothing is ever edited in place or deleted.
-- 2. voter_choices (the open-ballot link) is now append-only: it always records what
--    the voter actually cast. The current choice is found by following replacements.
-- 3. Step-up MFA: admin_sessions.mfa_stepup_at. The voter-linked functions below take
--    the session token hash (not just an admin id) and check, in the database, that the
--    session is live, MFA-verified, belongs to an active Super Admin and had a fresh
--    authenticator code in the last 10 minutes.
-- 4. Reconciliation counts the ballots voters cast (replacements excluded), so the
--    "one ballot per voter per race" check still holds after corrections.
-- =============================================================================
set search_path = public, extensions;

alter type correction_type add value if not exists 'REPLACE_CHOICE';

-- ---------------------------------------------------------------------------
-- Replacement ballots
-- ---------------------------------------------------------------------------
alter table ballots add column if not exists replaces_ballot_id uuid references ballots(id) on delete restrict;
alter table ballots add column if not exists created_by_correction_id uuid references correction_requests(id) on delete restrict;
alter table ballots drop constraint if exists ballot_replacement_consistent;
alter table ballots add constraint ballot_replacement_consistent
  check ((replaces_ballot_id is null) = (created_by_correction_id is null));
create unique index if not exists uq_ballot_replaced_once on ballots(replaces_ballot_id) where replaces_ballot_id is not null;
create unique index if not exists uq_ballot_one_per_correction on ballots(created_by_correction_id) where created_by_correction_id is not null;

alter table correction_requests add column if not exists new_candidate_id uuid;
alter table correction_requests drop constraint if exists fk_correction_new_candidate;
alter table correction_requests add constraint fk_correction_new_candidate
  foreign key (new_candidate_id, election_id) references candidates(id, election_id) on delete restrict;
alter table correction_requests drop constraint if exists replace_choice_names_candidate;
alter table correction_requests add constraint replace_choice_names_candidate
  check ((correction::text = 'REPLACE_CHOICE') = (new_candidate_id is not null));

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
     or new.evidence_note is distinct from old.evidence_note or new.evidence_path is distinct from old.evidence_path then
    raise exception 'IMMUTABLE: correction request content cannot be edited' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Ballot rows: contents never change; status changes only through an approved correction.
-- (Replaces 0008's version, which let admin_change_vote() rewrite candidate_id in place.)
create or replace function enforce_ballot_integrity() returns trigger
language plpgsql as $$
declare
  c record;
begin
  if tg_op = 'DELETE' then
    raise exception 'IMMUTABLE: ballots can never be deleted' using errcode = 'P0001';
  end if;
  if new.id is distinct from old.id or new.election_id is distinct from old.election_id
     or new.position_id is distinct from old.position_id or new.candidate_id is distinct from old.candidate_id
     or new.ballot_ref is distinct from old.ballot_ref
     or new.replaces_ballot_id is distinct from old.replaces_ballot_id
     or new.created_by_correction_id is distinct from old.created_by_correction_id then
    raise exception 'IMMUTABLE: ballot contents can never be modified' using errcode = 'P0001';
  end if;
  if new.last_correction_id is null or new.last_correction_id is not distinct from old.last_correction_id then
    raise exception 'IMMUTABLE: ballot status changes require an approved correction request' using errcode = 'P0001';
  end if;
  select * into c from correction_requests where id = new.last_correction_id;
  if c.id is null or c.status <> 'APPROVED' or c.ballot_id <> new.id
     or (c.correction::text in ('INVALIDATE_BALLOT', 'REPLACE_CHOICE') and new.status <> 'INVALIDATED')
     or (c.correction::text = 'REINSTATE_BALLOT' and new.status <> 'VALID') then
    raise exception 'IMMUTABLE: correction does not authorise this ballot change' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- New ballot rows: either an ordinary cast (no correction link) or the replacement
-- written by an approved REPLACE_CHOICE correction for exactly the ballot it supersedes.
create or replace function enforce_ballot_insert() returns trigger
language plpgsql as $$
declare
  c record;
  o record;
begin
  if new.status <> 'VALID' or new.last_correction_id is not null then
    raise exception 'IMMUTABLE: new ballots must start valid and uncorrected' using errcode = 'P0001';
  end if;
  if new.created_by_correction_id is null then
    return new;
  end if;
  select * into c from correction_requests where id = new.created_by_correction_id;
  select * into o from ballots where id = new.replaces_ballot_id;
  if c.id is null or c.status <> 'APPROVED' or c.correction::text <> 'REPLACE_CHOICE'
     or c.ballot_id is distinct from new.replaces_ballot_id or c.new_candidate_id is distinct from new.candidate_id
     or o.id is null or o.election_id <> new.election_id or o.position_id <> new.position_id
     or o.status <> 'INVALIDATED' or o.last_correction_id is distinct from c.id then
    raise exception 'IMMUTABLE: a replacement ballot needs an approved correction for the ballot it replaces' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_ballot_insert on ballots;
create trigger trg_ballot_insert before insert on ballots
  for each row execute function enforce_ballot_insert();

-- voter_choices: what the voter cast. Never updated from now on (and never deleted, 0008).
create or replace function forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception 'IMMUTABLE: rows in % cannot be modified', tg_table_name using errcode = 'P0001';
end $$;
drop trigger if exists trg_voter_choices_no_update on voter_choices;
create trigger trg_voter_choices_no_update before update on voter_choices
  for each row execute function forbid_update();

drop function if exists admin_change_vote(uuid, uuid, uuid, uuid, uuid, text, text);
drop function if exists admin_list_votes(uuid, uuid, text);

-- ---------------------------------------------------------------------------
-- Step-up MFA, checked in the database for voter-linked functions
-- ---------------------------------------------------------------------------
alter table admin_sessions add column if not exists mfa_stepup_at timestamptz;

create or replace function session_admin(p_session_hash text, p_role text, p_stepup_minutes integer) returns uuid
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid;
  v_role text;
  v_step timestamptz;
begin
  select a.id, a.role_code, s.mfa_stepup_at into v_id, v_role, v_step
    from admin_sessions s join election_admins a on a.id = s.admin_id
   where s.token_hash = p_session_hash and s.revoked_at is null and s.expires_at > now()
     and s.mfa_verified and a.is_active and a.mfa_enabled
     and s.last_seen_at > now() - interval '30 minutes';
  if v_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_role is not null and v_role <> p_role then
    raise exception 'FORBIDDEN: this needs the % role', p_role using errcode = 'P0001';
  end if;
  if p_stepup_minutes is not null and (v_step is null or v_step < now() - make_interval(mins => p_stepup_minutes)) then
    raise exception 'STEP_UP_REQUIRED' using errcode = 'P0001';
  end if;
  return v_id;
end $$;

-- Latest ballot in a replacement chain.
create or replace function ballot_chain_head(p_ballot_id uuid) returns uuid
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  with recursive ch as (
    select b.id, 0 as depth from ballots b where b.id = p_ballot_id
    union all
    select b.id, ch.depth + 1 from ballots b join ch on b.replaces_ballot_id = ch.id
  )
  select id from ch order by depth desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Super Admin view of voter-linked votes: original choice, current choice, history
-- ---------------------------------------------------------------------------
create or replace function admin_vote_records(p_session_hash text, p_election_id uuid, p_ip_hash text)
returns table (student_id uuid, roll_number text, full_name text, voted_at timestamptz, receipt_code text,
               position_id uuid, position_code text, position_gender text, position_order integer,
               original_candidate_id uuid, original_candidate_name text, original_ballot_ref text,
               current_candidate_id uuid, current_candidate_name text, current_ballot_ref text, current_status text,
               approved_corrections integer, legacy_changed_at timestamptz, legacy_change_reason text,
               pending_request_id uuid, pending_correction text, pending_candidate_name text, pending_requested_by uuid)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_admin uuid;
begin
  v_admin := session_admin(p_session_hash, 'SUPER_ADMIN', 10);
  perform append_audit('ADMIN', v_admin, 'VOTES.VIEWED', 'election', p_election_id::text, '{}'::jsonb, p_ip_hash);
  return query
    with links as (
      select vc.*, ob.id as orig_id, ballot_chain_head(ob.id) as head_id
        from voter_choices vc join ballots ob on ob.ballot_ref = vc.ballot_ref
       where vc.election_id = p_election_id
    )
    select s.id, s.roll_number, s.full_name, vp.voted_at, vp.receipt_code,
           p.id, p.code, p.gender, p.display_order,
           coalesce(l.original_candidate_id, l.candidate_id), oc.display_name, l.ballot_ref,
           hb.candidate_id, hc.display_name, hb.ballot_ref, hb.status::text,
           (select count(*)::int from correction_requests r
             where r.status = 'APPROVED' and r.ballot_id in (
               with recursive ch as (select l.orig_id as id union all select b.id from ballots b join ch on b.replaces_ballot_id = ch.id)
               select id from ch)),
           l.changed_at, l.change_reason,
           pr.id, pr.correction::text, pc.display_name, pr.requested_by
      from voter_participation vp
      join students s on s.id = vp.student_id
      left join links l on l.student_id = vp.student_id
      left join election_positions p on p.id = l.position_id
      left join candidates oc on oc.id = coalesce(l.original_candidate_id, l.candidate_id)
      left join ballots hb on hb.id = l.head_id
      left join candidates hc on hc.id = hb.candidate_id
      left join correction_requests pr on pr.ballot_id = l.head_id and pr.status = 'PENDING'
      left join candidates pc on pc.id = pr.new_candidate_id
     where vp.election_id = p_election_id
     order by vp.voted_at, s.roll_number, p.display_order;
end $$;

-- ---------------------------------------------------------------------------
-- Request a vote change (REPLACE_CHOICE). Super Admin only (they are the only role
-- that can see whose ballot is whose); a DIFFERENT Super Admin must approve it.
-- ---------------------------------------------------------------------------
create or replace function request_choice_change(
  p_session_hash text, p_election_id uuid, p_student_id uuid, p_position_id uuid, p_new_candidate_id uuid,
  p_reason text, p_evidence_note text, p_ip_hash text
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
begin
  v_admin := session_admin(p_session_hash, 'SUPER_ADMIN', 10);
  if not admin_has_permission(v_admin, 'corrections.create') then
    raise exception 'FORBIDDEN: corrections.create required' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 20 then
    raise exception 'VALIDATION: explain the reason in at least 20 characters' using errcode = 'P0001';
  end if;
  select e.status into st from elections e where e.id = p_election_id for share;
  if st is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if st <> 'CLOSED' then
    raise exception 'ELECTION_LOCKED: votes can only be corrected after voting closes and before results are published' using errcode = 'P0001';
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
    insert into correction_requests (election_id, ballot_id, correction, reason, evidence_note, requested_by, new_candidate_id)
    values (p_election_id, hb.id, 'REPLACE_CHOICE', btrim(p_reason), nullif(btrim(coalesce(p_evidence_note, '')), ''), v_admin, p_new_candidate_id)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CONFLICT: a correction for this vote is already pending' using errcode = 'P0001';
  end;
  -- Same detail level as other corrections: the (anonymous) ballot reference and the
  -- requested candidate, never the voter. Ballot ref + candidate is already in the ledger.
  perform append_audit('ADMIN', v_admin, 'CORRECTION.REQUESTED', 'correction_request', v_id::text,
    jsonb_build_object('ballot_ref', hb.ballot_ref, 'correction', 'REPLACE_CHOICE', 'reason', btrim(p_reason),
                       'from_candidate', (select display_name from candidates where id = hb.candidate_id),
                       'to_candidate', (select display_name from candidates where id = p_new_candidate_id)),
    p_ip_hash);
  return v_id;
end $$;

-- Which voter each pending/decided REPLACE_CHOICE concerns — Super Admins only.
create or replace function admin_correction_subjects(p_session_hash text, p_election_id uuid)
returns table (correction_id uuid, roll_number text, full_name text)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
begin
  perform session_admin(p_session_hash, 'SUPER_ADMIN', null);
  return query
    with recursive ch as (
      select vc.student_id, ob.id from voter_choices vc join ballots ob on ob.ballot_ref = vc.ballot_ref
       where vc.election_id = p_election_id
      union all
      select ch.student_id, b.id from ballots b join ch on b.replaces_ballot_id = ch.id
    )
    select r.id, s.roll_number, s.full_name
      from correction_requests r join ch on ch.id = r.ballot_id join students s on s.id = ch.student_id
     where r.election_id = p_election_id;
end $$;

-- ---------------------------------------------------------------------------
-- Second-person review, now including REPLACE_CHOICE.
-- ---------------------------------------------------------------------------
create or replace function review_correction(
  p_request_id uuid, p_reviewer_id uuid, p_approve boolean, p_note text, p_ip_hash text
) returns correction_status
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  r correction_requests%rowtype;
  b ballots%rowtype;
  st election_status;
  v_new correction_status;
  v_ref text;
  v_details jsonb;
begin
  select * into r from correction_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if r.status <> 'PENDING' then
    raise exception 'INVALID_STATE: correction is already %', r.status using errcode = 'P0001';
  end if;
  if r.requested_by = p_reviewer_id then
    raise exception 'SECOND_PERSON_REQUIRED: the requester cannot review their own correction' using errcode = 'P0001';
  end if;
  if not admin_has_permission(p_reviewer_id, 'corrections.review') then
    raise exception 'FORBIDDEN: reviewer lacks corrections.review' using errcode = 'P0001';
  end if;
  if r.correction::text = 'REPLACE_CHOICE'
     and not exists (select 1 from election_admins a where a.id = p_reviewer_id and a.role_code = 'SUPER_ADMIN') then
    raise exception 'FORBIDDEN: a vote change must be approved by a second Super Admin' using errcode = 'P0001';
  end if;
  if p_note is null or length(btrim(p_note)) < 5 then
    raise exception 'VALIDATION: a review note is required' using errcode = 'P0001';
  end if;
  select status into st from elections where id = r.election_id for update;
  if st <> 'CLOSED' then
    raise exception 'INVALID_STATE: corrections can only be applied while the election is closed and unpublished' using errcode = 'P0001';
  end if;

  select * into b from ballots where id = r.ballot_id for update;
  v_new := case when p_approve then 'APPROVED'::correction_status else 'REJECTED'::correction_status end;

  if p_approve then
    if (r.correction::text in ('INVALIDATE_BALLOT', 'REPLACE_CHOICE') and b.status <> 'VALID')
       or (r.correction::text = 'REINSTATE_BALLOT' and b.status <> 'INVALIDATED') then
      raise exception 'INVALID_STATE: ballot is already %', b.status using errcode = 'P0001';
    end if;
    if exists (select 1 from ballots x where x.replaces_ballot_id = b.id) then
      raise exception 'INVALID_STATE: this ballot was replaced by a correction; correct the replacement instead' using errcode = 'P0001';
    end if;
  end if;

  update correction_requests
     set status = v_new, reviewed_by = p_reviewer_id, reviewed_at = now(), review_note = p_note,
         ballot_status_before = b.status
   where id = r.id;

  v_details := jsonb_build_object('ballot_ref', b.ballot_ref, 'correction', r.correction, 'requested_by', r.requested_by,
                                  'ballot_status_before', b.status, 'note', p_note);
  if p_approve then
    update ballots
       set status = case when r.correction::text = 'REINSTATE_BALLOT' then 'VALID'::ballot_status else 'INVALIDATED'::ballot_status end,
           last_correction_id = r.id
     where id = b.id;
    if r.correction::text = 'REPLACE_CHOICE' then
      v_ref := 'B-' || upper(encode(gen_random_bytes(8), 'hex'));
      insert into ballots (election_id, position_id, candidate_id, ballot_ref, replaces_ballot_id, created_by_correction_id)
      values (b.election_id, b.position_id, r.new_candidate_id, v_ref, b.id, r.id);
      v_details := v_details || jsonb_build_object(
        'replacement_ballot_ref', v_ref,
        'from_candidate', (select display_name from candidates where id = b.candidate_id),
        'to_candidate', (select display_name from candidates where id = r.new_candidate_id));
    end if;
    -- Any previous result verification no longer matches the tally.
    update elections set results_verified_at = null, results_verified_by = null, results_verified_hash = null
     where id = r.election_id;
  end if;

  perform append_audit('ADMIN', p_reviewer_id,
    case when p_approve then 'CORRECTION.APPROVED' else 'CORRECTION.REJECTED' end,
    'correction_request', r.id::text, v_details, p_ip_hash);
  return v_new;
end $$;

-- The voter's receipt page: when was this voter's vote last corrected (null if never).
create or replace function voter_choice_changed_at(p_student_id uuid, p_election_id uuid) returns timestamptz
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  with recursive ch as (
    select ob.id from voter_choices vc join ballots ob on ob.ballot_ref = vc.ballot_ref
     where vc.student_id = p_student_id and vc.election_id = p_election_id
    union all
    select b.id from ballots b join ch on b.replaces_ballot_id = ch.id
  )
  select greatest(
    (select max(changed_at) from voter_choices where student_id = p_student_id and election_id = p_election_id),
    (select max(r.reviewed_at) from correction_requests r where r.status = 'APPROVED' and r.ballot_id in (select id from ch))
  );
$$;

-- ---------------------------------------------------------------------------
-- Totals: "total_ballots" = ballots voters cast (one per voter per race);
-- replacements are counted separately so reconciliation stays exact.
-- ---------------------------------------------------------------------------
drop function if exists ballot_totals(uuid);
create function ballot_totals(p_election_id uuid)
returns table (total_ballots integer, valid_ballots integer, invalidated_ballots integer, participation integer, positions integer,
               replacement_ballots integer)
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select
    (select count(*)::int from ballots where election_id = p_election_id and created_by_correction_id is null),
    (select count(*)::int from ballots where election_id = p_election_id and status = 'VALID'),
    (select count(*)::int from ballots where election_id = p_election_id and status = 'INVALIDATED'),
    (select count(*)::int from voter_participation where election_id = p_election_id),
    (select count(*)::int from election_positions where election_id = p_election_id),
    (select count(*)::int from ballots where election_id = p_election_id and created_by_correction_id is not null);
$$;

drop function if exists ballot_totals_by_position(uuid);
create function ballot_totals_by_position(p_election_id uuid)
returns table (position_id uuid, code text, title text, gender text, display_order integer,
               total_ballots integer, valid_ballots integer, invalidated_ballots integer, replacement_ballots integer)
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select p.id, p.code, p.title, p.gender, p.display_order,
         (count(b.id) filter (where b.created_by_correction_id is null))::int,
         (count(b.id) filter (where b.status = 'VALID'))::int,
         (count(b.id) filter (where b.status = 'INVALIDATED'))::int,
         (count(b.id) filter (where b.created_by_correction_id is not null))::int
    from election_positions p
    left join ballots b on b.position_id = p.id and b.election_id = p.election_id
   where p.election_id = p_election_id
   group by p.id, p.code, p.title, p.gender, p.display_order
   order by p.display_order, p.code;
$$;

drop function if exists ballot_ledger(uuid);
create function ballot_ledger(p_election_id uuid)
returns table (ballot_id uuid, ballot_ref text, candidate_id uuid, candidate_name text, status ballot_status, last_correction_id uuid,
               position_id uuid, position_title text, position_gender text, replaces_ballot_ref text, created_by_correction_id uuid)
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
           p.id, p.title, p.gender, ob.ballot_ref, b.created_by_correction_id
      from ballots b
      join candidates c on c.id = b.candidate_id
      join election_positions p on p.id = b.position_id
      left join ballots ob on ob.id = b.replaces_ballot_id
     where b.election_id = p_election_id
     order by b.ballot_ref;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
  r text;
begin
  foreach f in array array[
    'session_admin(text, text, integer)', 'ballot_chain_head(uuid)',
    'admin_vote_records(text, uuid, text)', 'request_choice_change(text, uuid, uuid, uuid, uuid, text, text, text)',
    'admin_correction_subjects(text, uuid)', 'review_correction(uuid, uuid, boolean, text, text)',
    'voter_choice_changed_at(uuid, uuid)', 'ballot_totals(uuid)', 'ballot_totals_by_position(uuid)', 'ballot_ledger(uuid)'
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

-- Explicit permission for the voter-linked records (Super Admin only), mirrored in src/lib/permissions.ts.
update admin_roles set permissions = array_append(permissions, 'votes.read')
 where code = 'SUPER_ADMIN' and not ('votes.read' = any(permissions));
$tt_migration_9$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000009_admin_controls.sql', 'ad3c61df3432ee236c67fb34b49fa2c73f69491a11a7b240178270a30366f25f');
    raise notice 'applied 20261123000009_admin_controls.sql';
  elsif prev <> 'ad3c61df3432ee236c67fb34b49fa2c73f69491a11a7b240178270a30366f25f' then
    raise exception 'Migration 20261123000009_admin_controls.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

commit;

select filename, applied_at from public.schema_migrations order by filename desc limit 2;
