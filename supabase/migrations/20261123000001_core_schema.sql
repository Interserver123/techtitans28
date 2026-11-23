-- =============================================================================
-- TechTitans-28 CR Election Portal — core schema
-- Islamic University, Bangladesh · Department of ICT
--
-- Design notes
--  * Voter identity (voter_participation) and candidate selection (ballots)
--    live in separate tables with NO foreign key, timestamp or shared random
--    value linking them. See DEVELOPMENT.md "Ballot confidentiality".
--  * All writes to ballots / participation happen inside SECURITY DEFINER
--    functions (migration 0002). The application role cannot INSERT, UPDATE
--    or DELETE those tables directly, and cannot SELECT ballots at all.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
do $$ begin
  create type election_status as enum
    ('DRAFT', 'SCHEDULED', 'LIVE', 'PAUSED', 'CLOSED', 'RESULTS_PUBLISHED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type candidate_status as enum ('PENDING', 'APPROVED', 'INACTIVE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ballot_status as enum ('VALID', 'INVALIDATED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type correction_type as enum ('INVALIDATE_BALLOT', 'REINSTATE_BALLOT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type correction_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- system_settings
-- ---------------------------------------------------------------------------
create table if not exists system_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  value       jsonb not null,
  description text,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Admin RBAC
-- ---------------------------------------------------------------------------
create table if not exists admin_roles (
  code        text primary key check (code ~ '^[A-Z_]{3,32}$'),
  name        text not null,
  description text not null,
  permissions text[] not null default '{}'
);

create table if not exists election_admins (
  id                   uuid primary key default gen_random_uuid(),
  email                citext not null unique check (length(email) between 5 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name            text not null check (length(btrim(full_name)) between 2 and 120),
  designation          text check (designation is null or length(designation) <= 120),
  role_code            text not null references admin_roles(code),
  password_hash        text not null,
  can_publish_results  boolean not null default false,
  mfa_secret_enc       text,
  mfa_pending_secret_enc text,
  mfa_enabled          boolean not null default false,
  mfa_last_step        bigint,
  is_active            boolean not null default true,
  failed_login_count   integer not null default 0 check (failed_login_count >= 0),
  locked_until         timestamptz,
  last_login_at        timestamptz,
  created_by           uuid references election_admins(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint mfa_enabled_requires_secret check (not mfa_enabled or mfa_secret_enc is not null)
);
drop trigger if exists trg_election_admins_updated on election_admins;
create trigger trg_election_admins_updated before update on election_admins
  for each row execute function set_updated_at();

create table if not exists admin_sessions (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references election_admins(id) on delete cascade,
  token_hash    text not null unique,
  mfa_verified  boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  ip_hash       text,
  user_agent    text check (user_agent is null or length(user_agent) <= 400)
);
create index if not exists idx_admin_sessions_admin on admin_sessions(admin_id);
create index if not exists idx_admin_sessions_expires on admin_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Students (official roll register)
-- ---------------------------------------------------------------------------
create table if not exists students (
  id                  uuid primary key default gen_random_uuid(),
  roll_number         text not null unique check (roll_number ~ '^[A-Za-z0-9-]{3,20}$'),
  full_name           text not null check (length(btrim(full_name)) between 2 and 120),
  contact_type        text not null check (contact_type in ('EMAIL', 'PHONE')),
  contact_value       text not null check (length(contact_value) between 5 and 254),
  batch               text not null check (length(batch) between 2 and 40),
  is_eligible         boolean not null default true,
  is_active           boolean not null default true,
  notes               text check (notes is null or length(notes) <= 500),
  is_dev_seed         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint contact_email_format check (contact_type <> 'EMAIL' or contact_value ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint contact_phone_format check (contact_type <> 'PHONE' or contact_value ~ '^\+?[0-9]{10,15}$')
);
create index if not exists idx_students_batch on students(batch);
create index if not exists idx_students_name on students(lower(full_name));
create index if not exists idx_students_contact on students(lower(contact_value));
drop trigger if exists trg_students_updated on students;
create trigger trg_students_updated before update on students
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Elections
-- ---------------------------------------------------------------------------
create table if not exists elections (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null check (length(btrim(title)) between 3 and 160),
  description            text not null default '' check (length(description) <= 4000),
  status                 election_status not null default 'DRAFT',
  opens_at               timestamptz not null,
  closes_at              timestamptz not null,
  eligible_snapshot      integer check (eligible_snapshot is null or eligible_snapshot >= 0),
  opened_at              timestamptz,
  closed_at              timestamptz,
  results_verified_at    timestamptz,
  results_verified_by    uuid references election_admins(id),
  results_verified_hash  text,
  results_published_at   timestamptz,
  results_published_by   uuid references election_admins(id),
  result_note            text check (result_note is null or length(result_note) <= 2000),
  created_by             uuid references election_admins(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint election_window check (closes_at > opens_at),
  constraint published_requires_timestamp check (status <> 'RESULTS_PUBLISHED' or results_published_at is not null)
);
-- At most one election may be in an active phase at any time.
create unique index if not exists uq_single_active_election on elections ((true))
  where status in ('SCHEDULED', 'LIVE', 'PAUSED');
create index if not exists idx_elections_status on elections(status);
drop trigger if exists trg_elections_updated on elections;
create trigger trg_elections_updated before update on elections
  for each row execute function set_updated_at();

-- State machine enforced in the database, independent of application code.
create or replace function enforce_election_transition() returns trigger
language plpgsql as $$
declare
  ok boolean;
begin
  if new.status = old.status then
    -- Configuration changes are restricted by phase.
    if old.status in ('CLOSED', 'RESULTS_PUBLISHED') and (
         new.opens_at is distinct from old.opens_at or new.closes_at is distinct from old.closes_at
         or new.title is distinct from old.title or new.description is distinct from old.description) then
      raise exception 'ELECTION_LOCKED: a closed election cannot be reconfigured' using errcode = 'P0001';
    end if;
    if old.status in ('LIVE', 'PAUSED') and (
         new.opens_at is distinct from old.opens_at
         or (new.closes_at is distinct from old.closes_at and new.closes_at < old.closes_at)) then
      raise exception 'ELECTION_LOCKED: while voting is underway only the closing time may be extended' using errcode = 'P0001';
    end if;
    if old.status = 'RESULTS_PUBLISHED' and (
         new.results_published_at is distinct from old.results_published_at
         or new.results_verified_hash is distinct from old.results_verified_hash) then
      raise exception 'ELECTION_LOCKED: published results are immutable' using errcode = 'P0001';
    end if;
    return new;
  end if;

  ok := (old.status, new.status) in (
    ('DRAFT'::election_status, 'SCHEDULED'::election_status),
    ('SCHEDULED', 'DRAFT'),
    ('SCHEDULED', 'LIVE'),
    ('SCHEDULED', 'CLOSED'),
    ('LIVE', 'PAUSED'),
    ('PAUSED', 'LIVE'),
    ('LIVE', 'CLOSED'),
    ('PAUSED', 'CLOSED'),
    ('CLOSED', 'RESULTS_PUBLISHED')
  );
  if not ok then
    raise exception 'INVALID_TRANSITION: % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.status = 'LIVE' and now() >= new.closes_at then
    raise exception 'INVALID_TRANSITION: closing time has already passed' using errcode = 'P0001';
  end if;
  if new.status = 'RESULTS_PUBLISHED' and new.results_verified_hash is null then
    raise exception 'INVALID_TRANSITION: results must be verified before publication' using errcode = 'P0001';
  end if;
  if new.status = 'LIVE' and old.opened_at is null then
    new.opened_at := now();
  end if;
  if new.status = 'CLOSED' then
    new.closed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_election_transition on elections;
create trigger trg_election_transition before update on elections
  for each row execute function enforce_election_transition();

create or replace function forbid_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'IMMUTABLE: rows in % cannot be deleted', tg_table_name using errcode = 'P0001';
end $$;

create or replace function forbid_election_delete() returns trigger
language plpgsql as $$
begin
  if old.status <> 'DRAFT' then
    raise exception 'IMMUTABLE: only draft elections can be deleted' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists trg_elections_no_delete on elections;
create trigger trg_elections_no_delete before delete on elections
  for each row execute function forbid_election_delete();

-- ---------------------------------------------------------------------------
-- Positions (one: Class Representative) and candidates
-- ---------------------------------------------------------------------------
create table if not exists election_positions (
  id             uuid primary key default gen_random_uuid(),
  election_id    uuid not null references elections(id) on delete cascade,
  code           text not null check (code ~ '^[A-Z_]{2,20}$'),
  title          text not null check (length(title) between 2 and 120),
  max_selections integer not null default 1 check (max_selections = 1),
  display_order  integer not null default 0,
  unique (election_id, code),
  unique (id, election_id)
);

create table if not exists candidates (
  id             uuid primary key default gen_random_uuid(),
  election_id    uuid not null references elections(id) on delete restrict,
  position_id    uuid not null,
  student_id     uuid not null references students(id) on delete restrict,
  display_name   text not null check (length(btrim(display_name)) between 2 and 120),
  introduction   text not null default '' check (length(introduction) <= 600),
  manifesto      text not null default '' check (length(manifesto) <= 6000),
  photo_path     text check (photo_path is null or photo_path ~ '^[A-Za-z0-9/_.-]{1,200}$'),
  status         candidate_status not null default 'PENDING',
  display_order  integer not null default 0,
  created_by     uuid references election_admins(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (position_id, student_id),
  unique (id, election_id),
  foreign key (position_id, election_id) references election_positions(id, election_id) on delete restrict
);
create index if not exists idx_candidates_election on candidates(election_id, status);
drop trigger if exists trg_candidates_updated on candidates;
create trigger trg_candidates_updated before update on candidates
  for each row execute function set_updated_at();

-- Candidate roster is frozen once voting begins.
create or replace function enforce_candidate_lock() returns trigger
language plpgsql as $$
declare
  st election_status;
begin
  select status into st from elections where id = coalesce(new.election_id, old.election_id);
  if st not in ('DRAFT', 'SCHEDULED') then
    raise exception 'CANDIDATES_LOCKED: candidates cannot change once voting has started (election is %)', st using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
drop trigger if exists trg_candidate_lock on candidates;
create trigger trg_candidate_lock before insert or update or delete on candidates
  for each row execute function enforce_candidate_lock();

-- ---------------------------------------------------------------------------
-- OTP challenges
-- ---------------------------------------------------------------------------
create table if not exists otp_verifications (
  id            uuid primary key default gen_random_uuid(),
  challenge_hash text not null unique,
  student_id    uuid not null references students(id) on delete cascade,
  election_id   uuid not null references elections(id) on delete cascade,
  code_hash     text not null,
  attempts      integer not null default 0 check (attempts >= 0),
  max_attempts  integer not null default 5 check (max_attempts between 1 and 10),
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  invalidated_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_otp_student on otp_verifications(student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Voter credentials (short-lived authenticated voting sessions)
-- ---------------------------------------------------------------------------
create table if not exists voter_credentials (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  student_id    uuid not null references students(id) on delete cascade,
  election_id   uuid not null references elections(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  check (expires_at > created_at)
);
create index if not exists idx_voter_credentials_student on voter_credentials(student_id, election_id);

-- ---------------------------------------------------------------------------
-- Voter participation  (WHO voted — never WHAT they voted)
-- ---------------------------------------------------------------------------
create table if not exists voter_participation (
  id            uuid primary key default gen_random_uuid(),
  election_id   uuid not null references elections(id) on delete restrict,
  student_id    uuid not null references students(id) on delete restrict,
  receipt_code  text not null unique check (receipt_code ~ '^TT28-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  voted_at      timestamptz not null default now(),
  constraint uq_one_participation_per_voter unique (election_id, student_id)
);
create index if not exists idx_participation_time on voter_participation(election_id, voted_at);

-- ---------------------------------------------------------------------------
-- Ballots  (WHAT was chosen — never WHO chose it)
-- No timestamp, no student reference, random UUID keys.
-- ---------------------------------------------------------------------------
create table if not exists ballots (
  id             uuid primary key default gen_random_uuid(),
  election_id    uuid not null references elections(id) on delete restrict,
  position_id    uuid not null,
  candidate_id   uuid not null,
  ballot_ref     text not null unique check (ballot_ref ~ '^B-[A-F0-9]{16}$'),
  status         ballot_status not null default 'VALID',
  last_correction_id uuid,
  foreign key (candidate_id, election_id) references candidates(id, election_id) on delete restrict,
  foreign key (position_id, election_id) references election_positions(id, election_id) on delete restrict
);
create index if not exists idx_ballots_tally on ballots(election_id, candidate_id) where status = 'VALID';

-- ---------------------------------------------------------------------------
-- Correction requests (two-person rule)
-- ---------------------------------------------------------------------------
create table if not exists correction_requests (
  id               uuid primary key default gen_random_uuid(),
  election_id      uuid not null references elections(id) on delete restrict,
  ballot_id        uuid not null references ballots(id) on delete restrict,
  correction       correction_type not null,
  reason           text not null check (length(btrim(reason)) between 20 and 2000),
  evidence_note    text check (evidence_note is null or length(evidence_note) <= 2000),
  evidence_path    text check (evidence_path is null or evidence_path ~ '^[A-Za-z0-9/_.-]{1,200}$'),
  status           correction_status not null default 'PENDING',
  requested_by     uuid not null references election_admins(id),
  requested_at     timestamptz not null default now(),
  reviewed_by      uuid references election_admins(id),
  reviewed_at      timestamptz,
  review_note      text check (review_note is null or length(review_note) <= 2000),
  ballot_status_before ballot_status,
  constraint second_person_review check (reviewed_by is null or reviewed_by <> requested_by),
  constraint review_complete check ((status in ('PENDING', 'CANCELLED')) = (reviewed_by is null))
);
create index if not exists idx_corrections_status on correction_requests(election_id, status);
-- Only one open request per ballot.
create unique index if not exists uq_one_pending_correction_per_ballot on correction_requests(ballot_id)
  where status = 'PENDING';

alter table ballots drop constraint if exists fk_ballot_last_correction;
alter table ballots add constraint fk_ballot_last_correction
  foreign key (last_correction_id) references correction_requests(id);

-- Corrections are append-only: once reviewed, immutable.
create or replace function enforce_correction_immutability() returns trigger
language plpgsql as $$
begin
  if old.status <> 'PENDING' then
    raise exception 'IMMUTABLE: correction % is already %', old.id, old.status using errcode = 'P0001';
  end if;
  if new.reason is distinct from old.reason or new.ballot_id is distinct from old.ballot_id
     or new.correction is distinct from old.correction or new.requested_by is distinct from old.requested_by
     or new.requested_at is distinct from old.requested_at or new.election_id is distinct from old.election_id then
    raise exception 'IMMUTABLE: correction request content cannot be edited' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_correction_immutable on correction_requests;
create trigger trg_correction_immutable before update on correction_requests
  for each row execute function enforce_correction_immutability();
drop trigger if exists trg_correction_no_delete on correction_requests;
create trigger trg_correction_no_delete before delete on correction_requests
  for each row execute function forbid_delete();

-- Ballots may only change status through an approved correction; never deleted.
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
drop trigger if exists trg_ballot_integrity on ballots;
create trigger trg_ballot_integrity before update or delete on ballots
  for each row execute function enforce_ballot_integrity();

drop trigger if exists trg_participation_no_delete on voter_participation;
create trigger trg_participation_no_delete before update or delete on voter_participation
  for each row execute function forbid_delete();

-- ---------------------------------------------------------------------------
-- Official results (snapshot written at publication)
-- ---------------------------------------------------------------------------
create table if not exists election_results (
  id             uuid primary key default gen_random_uuid(),
  election_id    uuid not null references elections(id) on delete restrict,
  candidate_id   uuid not null,
  vote_count     integer not null check (vote_count >= 0),
  rank           integer not null check (rank >= 1),
  is_winner      boolean not null default false,
  is_tied        boolean not null default false,
  published_at   timestamptz not null default now(),
  unique (election_id, candidate_id),
  foreign key (candidate_id, election_id) references candidates(id, election_id)
);
drop trigger if exists trg_results_immutable on election_results;
create trigger trg_results_immutable before update or delete on election_results
  for each row execute function forbid_delete();

-- ---------------------------------------------------------------------------
-- Disputes (identity misuse / problems). A dispute NEVER grants a ballot.
-- ---------------------------------------------------------------------------
create table if not exists disputes (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique check (reference ~ '^D-[A-Z2-9]{8}$'),
  election_id    uuid references elections(id) on delete restrict,
  roll_number    text check (roll_number is null or roll_number ~ '^[A-Za-z0-9-]{3,20}$'),
  reporter_name  text not null check (length(btrim(reporter_name)) between 2 and 120),
  reporter_contact text not null check (length(reporter_contact) between 5 and 254),
  category       text not null check (category in ('IDENTITY_MISUSE', 'OTP_NOT_RECEIVED', 'NOT_ON_REGISTER', 'TECHNICAL', 'OTHER')),
  description    text not null check (length(btrim(description)) between 10 and 3000),
  status         text not null default 'OPEN' check (status in ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
  resolution_note text check (resolution_note is null or length(resolution_note) <= 3000),
  handled_by     uuid references election_admins(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists trg_disputes_updated on disputes;
create trigger trg_disputes_updated before update on disputes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Media objects (database storage driver; used when Supabase Storage is not
-- configured, e.g. local development and tests)
-- ---------------------------------------------------------------------------
create table if not exists media_objects (
  path          text primary key check (path ~ '^[A-Za-z0-9/_.-]{1,200}$'),
  content_type  text not null check (content_type in ('image/webp', 'image/jpeg', 'image/png', 'application/pdf')),
  is_public     boolean not null default false,
  bytes         bytea not null check (octet_length(bytes) <= 5242880),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window, keys are HMAC digests — never raw IPs/rolls)
-- ---------------------------------------------------------------------------
create table if not exists rate_limit_buckets (
  bucket_key    text primary key,
  window_start  timestamptz not null,
  hits          integer not null
);

create or replace function hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql as $$
declare
  v_hits integer;
begin
  insert into rate_limit_buckets as b (bucket_key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (bucket_key) do update
    set hits = case when b.window_start < now() - make_interval(secs => p_window_seconds) then 1 else b.hits + 1 end,
        window_start = case when b.window_start < now() - make_interval(secs => p_window_seconds) then now() else b.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

-- ---------------------------------------------------------------------------
-- Audit log — append-only, hash-chained
-- ---------------------------------------------------------------------------
create table if not exists audit_logs (
  id            bigserial primary key,
  occurred_at   timestamptz not null default clock_timestamp(),
  actor_type    text not null check (actor_type in ('ADMIN', 'SYSTEM', 'PUBLIC', 'VOTER')),
  actor_admin_id uuid references election_admins(id),
  actor_label   text,
  action        text not null check (action ~ '^[A-Z][A-Z0-9_.]{2,63}$'),
  entity_type   text,
  entity_id     text,
  details       jsonb not null default '{}'::jsonb,
  ip_hash       text,
  prev_hash     text not null,
  entry_hash    text not null unique
);
create index if not exists idx_audit_time on audit_logs(occurred_at desc);
create index if not exists idx_audit_action on audit_logs(action);
create index if not exists idx_audit_actor on audit_logs(actor_admin_id);

create or replace function audit_logs_compute_hash() returns trigger
language plpgsql as $$
declare
  v_prev text;
begin
  -- Serialise appends so the chain is linear.
  perform pg_advisory_xact_lock(hashtext('audit_logs_chain'));
  select entry_hash into v_prev from audit_logs order by id desc limit 1;
  new.prev_hash := coalesce(v_prev, repeat('0', 64));
  new.occurred_at := clock_timestamp();
  new.entry_hash := encode(digest(
      new.prev_hash || '|' || new.id::text || '|' || to_char(new.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
      new.actor_type || '|' || coalesce(new.actor_admin_id::text, '') || '|' || new.action || '|' ||
      coalesce(new.entity_type, '') || '|' || coalesce(new.entity_id, '') || '|' || new.details::text,
    'sha256'), 'hex');
  return new;
end $$;
drop trigger if exists trg_audit_hash on audit_logs;
create trigger trg_audit_hash before insert on audit_logs
  for each row execute function audit_logs_compute_hash();
drop trigger if exists trg_audit_immutable on audit_logs;
create trigger trg_audit_immutable before update or delete on audit_logs
  for each row execute function forbid_delete();
-- TRUNCATE bypasses row triggers; block it explicitly.
create or replace function forbid_truncate() returns trigger
language plpgsql as $$
begin
  raise exception 'IMMUTABLE: % cannot be truncated', tg_table_name using errcode = 'P0001';
end $$;
drop trigger if exists trg_audit_no_truncate on audit_logs;
create trigger trg_audit_no_truncate before truncate on audit_logs
  for each statement execute function forbid_truncate();
drop trigger if exists trg_ballots_no_truncate on ballots;
create trigger trg_ballots_no_truncate before truncate on ballots
  for each statement execute function forbid_truncate();
drop trigger if exists trg_participation_no_truncate on voter_participation;
create trigger trg_participation_no_truncate before truncate on voter_participation
  for each statement execute function forbid_truncate();
