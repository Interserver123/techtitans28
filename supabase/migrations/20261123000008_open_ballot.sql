-- =============================================================================
-- OPEN BALLOT (announced on /terms and on every sign-in / ballot screen).
-- Each vote cast from now on is also stored with the voter in voter_choices. Only a
-- Super Admin can read or change it, through the SECURITY DEFINER functions below,
-- which re-check the role in the database and write the audit log.
-- Votes cast before this migration have no link to a voter and stay anonymous.
-- =============================================================================
set search_path = public, extensions;

create table if not exists voter_choices (
  id                    uuid primary key default gen_random_uuid(),
  election_id           uuid not null references elections(id) on delete restrict,
  student_id            uuid not null references students(id) on delete restrict,
  position_id           uuid not null,
  candidate_id          uuid not null,
  ballot_ref            text not null unique references ballots(ballot_ref) on delete restrict,
  original_candidate_id uuid,
  recorded_at           timestamptz not null default now(),
  changed_at            timestamptz,
  changed_by            uuid,
  change_reason         text,
  unique (election_id, student_id, position_id),
  foreign key (candidate_id, election_id) references candidates(id, election_id) on delete restrict,
  foreign key (position_id, election_id) references election_positions(id, election_id) on delete restrict
);
create index if not exists idx_voter_choices_student on voter_choices(student_id, election_id);

alter table voter_choices enable row level security;
drop policy if exists app_server_access on voter_choices;
-- No policy and no grants: the application role cannot read or write this table directly.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'techtitans_app'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table voter_choices from %I', r);
    end if;
  end loop;
end $$;
drop trigger if exists trg_voter_choices_no_delete on voter_choices;
create trigger trg_voter_choices_no_delete before delete on voter_choices
  for each row execute function forbid_delete();

create or replace function enforce_ballot_integrity() returns trigger
language plpgsql as $$
declare
  c record;
begin
  if tg_op = 'DELETE' then
    raise exception 'IMMUTABLE: ballots can never be deleted' using errcode = 'P0001';
  end if;
  -- Super Admin vote change (admin_change_vote): ONLY the candidate may differ, same position, same status.
  if coalesce(current_setting('app.ballot_edit_override', true), '') = 'on'
     and new.id = old.id and new.election_id = old.election_id and new.position_id = old.position_id
     and new.ballot_ref = old.ballot_ref and new.status = old.status
     and new.last_correction_id is not distinct from old.last_correction_id then
    return new;
  end if;
  if new.id is distinct from old.id or new.election_id is distinct from old.election_id
     or new.position_id is distinct from old.position_id or new.candidate_id is distinct from old.candidate_id
     or new.ballot_ref is distinct from old.ballot_ref then
    raise exception 'IMMUTABLE: ballot contents can never be modified' using errcode = 'P0001';
  end if;
  if new.last_correction_id is null or new.last_correction_id is not distinct from old.last_correction_id then
    raise exception 'IMMUTABLE: ballot status changes require an approved correction request' using errcode = 'P0001';
  end if;
  select * into c from correction_requests where id = new.last_correction_id;
  if c.id is null or c.status <> 'APPROVED' or c.ballot_id <> new.id
     or (c.correction = 'INVALIDATE_BALLOT' and new.status <> 'INVALIDATED')
     or (c.correction = 'REINSTATE_BALLOT' and new.status <> 'VALID') then
    raise exception 'IMMUTABLE: correction does not authorise this ballot change' using errcode = 'P0001';
  end if;
  return new;
end $$;

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
  v_ref       text;
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
  -- Open ballot (see /terms): each ballot row is ALSO recorded against the voter in voter_choices,
  -- readable only by a Super Admin through admin_list_votes().
  for r in
    select c.id as cid, c.position_id as pid from candidates c where c.id = any (p_candidate_ids) order by random()
  loop
    v_ref := 'B-' || upper(encode(gen_random_bytes(8), 'hex'));
    insert into ballots (election_id, position_id, candidate_id, ballot_ref)
    values (v_el.id, r.pid, r.cid, v_ref);
    insert into voter_choices (election_id, student_id, position_id, candidate_id, ballot_ref)
    values (v_el.id, v_st.id, r.pid, r.cid, v_ref);
  end loop;

  receipt_code := v_receipt;
  voted_at := v_time;
  return next;
end $$;

create or replace function admin_list_votes(p_admin_id uuid, p_election_id uuid, p_ip_hash text)
returns table (student_id uuid, roll_number text, full_name text, voted_at timestamptz, receipt_code text,
               position_id uuid, position_code text, position_gender text, position_order integer,
               candidate_id uuid, candidate_name text, ballot_ref text,
               changed_at timestamptz, change_reason text, original_candidate_name text)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
begin
  if not exists (select 1 from election_admins a where a.id = p_admin_id and a.is_active and a.mfa_enabled and a.role_code = 'SUPER_ADMIN') then
    raise exception 'FORBIDDEN: only a Super Admin can view votes' using errcode = 'P0001';
  end if;
  perform append_audit('ADMIN', p_admin_id, 'VOTES.VIEWED', 'election', p_election_id::text, '{}'::jsonb, p_ip_hash);
  return query
    select s.id, s.roll_number, s.full_name, vp.voted_at, vp.receipt_code,
           p.id, p.code, p.gender, p.display_order,
           c.id, c.display_name, vc.ballot_ref,
           vc.changed_at, vc.change_reason, oc.display_name
      from voter_participation vp
      join students s on s.id = vp.student_id
      left join voter_choices vc on vc.student_id = vp.student_id and vc.election_id = vp.election_id
      left join election_positions p on p.id = vc.position_id
      left join candidates c on c.id = vc.candidate_id
      left join candidates oc on oc.id = vc.original_candidate_id
     where vp.election_id = p_election_id
     order by vp.voted_at, s.roll_number, p.display_order;
end $$;

create or replace function admin_change_vote(
  p_admin_id uuid, p_election_id uuid, p_student_id uuid, p_position_id uuid, p_new_candidate_id uuid,
  p_reason text, p_ip_hash text
) returns void
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  e   elections%rowtype;
  vc  voter_choices%rowtype;
  pg  text;
  sg  text;
  v_roll text;
  v_code text;
begin
  if not exists (select 1 from election_admins a where a.id = p_admin_id and a.is_active and a.mfa_enabled and a.role_code = 'SUPER_ADMIN') then
    raise exception 'FORBIDDEN: only a Super Admin can change a vote' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'VALIDATION: a reason of at least 5 characters is required' using errcode = 'P0001';
  end if;
  select * into e from elections where id = p_election_id for update;
  if e.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.status not in ('SCHEDULED', 'LIVE', 'PAUSED') then
    raise exception 'ELECTION_LOCKED: votes cannot be changed after the election is closed' using errcode = 'P0001';
  end if;
  select * into vc from voter_choices
   where election_id = p_election_id and student_id = p_student_id and position_id = p_position_id for update;
  if vc.id is null then
    raise exception 'INVALID_STATE: this vote was cast before the open-ballot notice (or does not exist) and cannot be changed' using errcode = 'P0001';
  end if;
  if vc.candidate_id = p_new_candidate_id then
    raise exception 'INVALID_STATE: the vote is already for this candidate' using errcode = 'P0001';
  end if;
  if not exists (select 1 from candidates c where c.id = p_new_candidate_id and c.election_id = p_election_id
                    and c.position_id = p_position_id and c.status = 'APPROVED') then
    raise exception 'INVALID_CANDIDATE' using errcode = 'P0001';
  end if;
  select p.gender, p.code into pg, v_code from election_positions p where p.id = p_position_id;
  if pg is not null then
    select s.gender into sg from candidates c join students s on s.id = c.student_id where c.id = p_new_candidate_id;
    if sg is distinct from pg then
      raise exception 'GENDER_MISMATCH' using errcode = 'P0001';
    end if;
  end if;

  perform set_config('app.ballot_edit_override', 'on', true);
  update ballots set candidate_id = p_new_candidate_id where ballot_ref = vc.ballot_ref;
  perform set_config('app.ballot_edit_override', 'off', true);
  update voter_choices
     set original_candidate_id = coalesce(original_candidate_id, vc.candidate_id), candidate_id = p_new_candidate_id,
         changed_at = now(), changed_by = p_admin_id, change_reason = btrim(p_reason)
   where id = vc.id;

  select roll_number into v_roll from students where id = p_student_id;
  -- The audit log records WHO was changed and WHY, never the candidates (auditors can read the log).
  perform append_audit('ADMIN', p_admin_id, 'VOTE.CHANGED_BY_ADMIN', 'student', p_student_id::text,
    jsonb_build_object('roll', v_roll, 'position', v_code, 'reason', btrim(p_reason)), p_ip_hash);
end $$;

create or replace function voter_choice_changed_at(p_student_id uuid, p_election_id uuid) returns timestamptz
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select max(changed_at) from voter_choices where student_id = p_student_id and election_id = p_election_id;
$$;

do $$
declare
  f text;
  r text;
begin
  foreach f in array array[
    'cast_ballot(text, uuid[])', 'admin_list_votes(uuid, uuid, text)',
    'admin_change_vote(uuid, uuid, uuid, uuid, uuid, text, text)', 'voter_choice_changed_at(uuid, uuid)'
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
