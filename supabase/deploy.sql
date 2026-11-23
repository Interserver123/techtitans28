-- =============================================================================
-- TechTitans-28 CR Election Portal — Supabase deployment script (GENERATED)
-- Source: supabase/migrations/*.sql · regenerate with: npm run supabase:bundle
--
-- HOW TO USE: Supabase dashboard → SQL Editor → New query → paste this whole
-- file → Run. Safe to run again: already-applied migrations are skipped.
-- The result grid shows the password of the application database role ONCE —
-- copy it into DATABASE_URL (see DEVELOPMENT.md → Deployment).
-- =============================================================================

begin;

create table if not exists public.schema_migrations (
  filename text primary key, checksum text not null, applied_at timestamptz not null default now());
revoke all on public.schema_migrations from public;
do $tt$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.schema_migrations from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.schema_migrations from service_role';
  end if;
end $tt$;

-- ---------------------------------------------------------------------------
-- 20261123000001_core_schema.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000001_core_schema.sql';
  if prev is null then
    execute $tt_migration_1$-- =============================================================================
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

-- Supabase convention: extensions live in the `extensions` schema.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
set search_path = public, extensions;

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
language plpgsql
set search_path = public, extensions, pg_temp as $$
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
$tt_migration_1$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000001_core_schema.sql', 'abad285b86bf593edadb034127a1b3d75a9289ac55a21d15905b5e8361849bbd');
    raise notice 'applied 20261123000001_core_schema.sql';
  elsif prev <> 'abad285b86bf593edadb034127a1b3d75a9289ac55a21d15905b5e8361849bbd' then
    raise exception 'Migration 20261123000001_core_schema.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261123000002_election_functions.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000002_election_functions.sql';
  if prev is null then
    execute $tt_migration_2$-- =============================================================================
-- Election business rules that MUST hold even if application code is wrong.
-- All functions are SECURITY DEFINER with a pinned search_path; they run with
-- the migration owner's privileges so the application role never needs direct
-- write access to ballots, participation or official results.
-- =============================================================================

-- Inserts into correction_requests must start life as PENDING.
create or replace function enforce_correction_insert() returns trigger
language plpgsql as $$
begin
  if new.status <> 'PENDING' or new.reviewed_by is not null or new.reviewed_at is not null then
    raise exception 'INVALID_CORRECTION: new correction requests must be pending' using errcode = 'P0001';
  end if;
  new.requested_at := now();
  return new;
end $$;
drop trigger if exists trg_correction_insert on correction_requests;
create trigger trg_correction_insert before insert on correction_requests
  for each row execute function enforce_correction_insert();

-- Publication requires the official snapshot to exist (only publish_results writes it).
create or replace function enforce_publication_snapshot() returns trigger
language plpgsql as $$
begin
  if new.status = 'RESULTS_PUBLISHED' and old.status <> 'RESULTS_PUBLISHED'
     and not exists (select 1 from election_results where election_id = new.id) then
    raise exception 'INVALID_TRANSITION: results can only be published through publish_results()' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_election_publication on elections;
create trigger trg_election_publication before update on elections
  for each row execute function enforce_publication_snapshot();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function random_code(p_len integer) returns text
language plpgsql volatile
set search_path = public, extensions, pg_temp as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symbols, no 0/O/1/I
  bytes bytea := gen_random_bytes(p_len);
  out text := '';
begin
  for i in 0 .. p_len - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function setting_text(p_key text, p_default text) returns text
language sql stable
set search_path = public, extensions, pg_temp as $$
  select coalesce((select value #>> '{}' from system_settings where key = p_key), p_default);
$$;

create or replace function append_audit(
  p_actor_type text, p_admin_id uuid, p_action text, p_entity_type text, p_entity_id text,
  p_details jsonb, p_ip_hash text
) returns bigint
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_id bigint;
  v_label text;
begin
  if p_admin_id is not null then
    select email::text into v_label from election_admins where id = p_admin_id;
  end if;
  insert into audit_logs (actor_type, actor_admin_id, actor_label, action, entity_type, entity_id, details, ip_hash, prev_hash, entry_hash)
  values (p_actor_type, p_admin_id, v_label, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb), p_ip_hash, '', '')
  returning id into v_id;
  return v_id;
end $$;

create or replace function admin_has_permission(p_admin_id uuid, p_permission text) returns boolean
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1 from election_admins a join admin_roles r on r.code = a.role_code
    where a.id = p_admin_id and a.is_active and a.mfa_enabled
      and (p_permission = any(r.permissions))
      and (p_permission <> 'results.publish' or a.role_code = 'SUPER_ADMIN' or a.can_publish_results)
  );
$$;

-- ---------------------------------------------------------------------------
-- Eligibility
-- ---------------------------------------------------------------------------
create or replace function eligible_voter_count() returns integer
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select count(*)::int from students
  where is_active and is_eligible and batch = setting_text('election.batch', 'TechTitans-28');
$$;

-- ---------------------------------------------------------------------------
-- Time-driven status transitions (Scheduled -> Live -> Closed)
-- ---------------------------------------------------------------------------
create or replace function refresh_election_status() returns void
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  e record;
begin
  for e in select * from elections where status in ('SCHEDULED', 'LIVE', 'PAUSED') for update loop
    if now() >= e.closes_at then
      update elections set status = 'CLOSED', eligible_snapshot = eligible_voter_count() where id = e.id;
      perform append_audit('SYSTEM', null, 'ELECTION.AUTO_CLOSED', 'election', e.id::text,
        jsonb_build_object('from', e.status, 'closes_at', e.closes_at), null);
    elsif e.status = 'SCHEDULED' and now() >= e.opens_at then
      update elections set status = 'LIVE' where id = e.id;
      perform append_audit('SYSTEM', null, 'ELECTION.AUTO_OPENED', 'election', e.id::text,
        jsonb_build_object('opens_at', e.opens_at), null);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- THE BALLOT TRANSACTION
--   * validates the voter credential (server-issued, hashed token)
--   * locks the election row (blocks concurrent pause/close) and student row
--     (serialises concurrent submissions by the same voter)
--   * records participation and an anonymous ballot atomically
--   * duplicate prevention is ALSO guaranteed by uq_one_participation_per_voter
-- ---------------------------------------------------------------------------
create or replace function cast_ballot(p_token_hash text, p_candidate_id uuid)
returns table (receipt_code text, voted_at timestamptz)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_cred   voter_credentials%rowtype;
  v_el     elections%rowtype;
  v_st     students%rowtype;
  v_cand   candidates%rowtype;
  v_receipt text;
  v_time   timestamptz;
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

  select * into v_cand from candidates
   where id = p_candidate_id and election_id = v_el.id and status = 'APPROVED';
  if v_cand.id is null then
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

  -- Anonymous ballot: no student id, no timestamp, independent random identifiers.
  insert into ballots (election_id, position_id, candidate_id, ballot_ref)
  values (v_el.id, v_cand.position_id, v_cand.id, 'B-' || upper(encode(gen_random_bytes(8), 'hex')));

  receipt_code := v_receipt;
  voted_at := v_time;
  return next;
end $$;

-- ---------------------------------------------------------------------------
-- Aggregates that are safe at any time (no candidate breakdown)
-- ---------------------------------------------------------------------------
create or replace function ballot_totals(p_election_id uuid)
returns table (total_ballots integer, valid_ballots integer, invalidated_ballots integer, participation integer)
language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select
    (select count(*)::int from ballots where election_id = p_election_id),
    (select count(*)::int from ballots where election_id = p_election_id and status = 'VALID'),
    (select count(*)::int from ballots where election_id = p_election_id and status = 'INVALIDATED'),
    (select count(*)::int from voter_participation where election_id = p_election_id);
$$;

-- ---------------------------------------------------------------------------
-- Candidate-wise tally: refuses to run before the election is closed.
-- ---------------------------------------------------------------------------
create or replace function compute_tally(p_election_id uuid)
returns table (candidate_id uuid, display_name text, roll_number text, votes integer, rank integer)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  st election_status;
begin
  select status into st from elections where id = p_election_id;
  if st is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if st not in ('CLOSED', 'RESULTS_PUBLISHED') then
    raise exception 'RESULTS_SEALED: candidate-wise results are sealed until the election closes' using errcode = 'P0001';
  end if;
  return query
    select c.id, c.display_name, s.roll_number,
           count(b.id) filter (where b.status = 'VALID')::int as votes,
           (rank() over (order by count(b.id) filter (where b.status = 'VALID') desc))::int as rank
      from candidates c
      join students s on s.id = c.student_id
      left join ballots b on b.candidate_id = c.id and b.election_id = c.election_id
     where c.election_id = p_election_id
       and (c.status = 'APPROVED' or b.id is not null)
     group by c.id, c.display_name, s.roll_number, c.display_order
     order by votes desc, c.display_order, c.display_name;
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
                       || v_tot.participation || '|' || v_corr, 'sha256'), 'hex');
end $$;

-- Anonymous ballot ledger, available only after closure (needed to reference
-- ballots in correction requests and for independent recount).
create or replace function ballot_ledger(p_election_id uuid)
returns table (ballot_id uuid, ballot_ref text, candidate_id uuid, candidate_name text, status ballot_status, last_correction_id uuid)
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
    select b.id, b.ballot_ref, b.candidate_id, c.display_name, b.status, b.last_correction_id
      from ballots b join candidates c on c.id = b.candidate_id
     where b.election_id = p_election_id
     order by b.ballot_ref;
end $$;

-- ---------------------------------------------------------------------------
-- Corrections: second-person review, applied atomically with an audit entry.
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
    if (r.correction = 'INVALIDATE_BALLOT' and b.status <> 'VALID')
       or (r.correction = 'REINSTATE_BALLOT' and b.status <> 'INVALIDATED') then
      raise exception 'INVALID_STATE: ballot is already %', b.status using errcode = 'P0001';
    end if;
  end if;

  update correction_requests
     set status = v_new, reviewed_by = p_reviewer_id, reviewed_at = now(), review_note = p_note,
         ballot_status_before = b.status
   where id = r.id;

  if p_approve then
    update ballots
       set status = case when r.correction = 'INVALIDATE_BALLOT' then 'INVALIDATED'::ballot_status else 'VALID'::ballot_status end,
           last_correction_id = r.id
     where id = b.id;
    -- Any previous result verification no longer matches the tally.
    update elections set results_verified_at = null, results_verified_by = null, results_verified_hash = null
     where id = r.election_id;
  end if;

  perform append_audit('ADMIN', p_reviewer_id,
    case when p_approve then 'CORRECTION.APPROVED' else 'CORRECTION.REJECTED' end,
    'correction_request', r.id::text,
    jsonb_build_object('ballot_ref', b.ballot_ref, 'correction', r.correction, 'requested_by', r.requested_by,
                       'ballot_status_before', b.status, 'note', p_note),
    p_ip_hash);
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Result verification & publication
-- ---------------------------------------------------------------------------
create or replace function verify_results(p_election_id uuid, p_admin_id uuid, p_ip_hash text) returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  st election_status;
  v_hash text;
  v_tot record;
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
  if v_tot.total_ballots <> v_tot.participation then
    raise exception 'RECONCILIATION_FAILED: % ballots vs % participation records', v_tot.total_ballots, v_tot.participation using errcode = 'P0001';
  end if;
  v_hash := tally_hash(p_election_id);
  update elections set results_verified_at = now(), results_verified_by = p_admin_id, results_verified_hash = v_hash
   where id = p_election_id;
  perform append_audit('ADMIN', p_admin_id, 'RESULTS.VERIFIED', 'election', p_election_id::text,
    jsonb_build_object('tally_hash', v_hash, 'total_ballots', v_tot.total_ballots, 'valid_ballots', v_tot.valid_ballots), p_ip_hash);
  return v_hash;
end $$;

create or replace function publish_results(p_election_id uuid, p_admin_id uuid, p_note text, p_ip_hash text)
returns table (candidate_id uuid, vote_count integer, rank integer, is_winner boolean, is_tied boolean)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  e elections%rowtype;
  v_hash text;
  v_top integer;
  v_top_count integer;
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

  select max(t.votes) into v_top from compute_tally(p_election_id) t;
  select count(*) into v_top_count from compute_tally(p_election_id) t where t.votes = v_top;
  if v_top_count > 1 and (p_note is null or length(btrim(p_note)) < 10) then
    raise exception 'TIE_NOTE_REQUIRED: the result is tied; record the committee tie-resolution note' using errcode = 'P0001';
  end if;

  insert into election_results (election_id, candidate_id, vote_count, rank, is_winner, is_tied)
  select p_election_id, t.candidate_id, t.votes, t.rank,
         (t.votes = v_top and v_top_count = 1 and v_top > 0),
         (t.votes = v_top and v_top_count > 1)
    from compute_tally(p_election_id) t;

  update elections
     set status = 'RESULTS_PUBLISHED', results_published_at = now(), results_published_by = p_admin_id,
         result_note = nullif(btrim(coalesce(p_note, '')), ''),
         eligible_snapshot = coalesce(eligible_snapshot, eligible_voter_count())
   where id = p_election_id;

  perform append_audit('ADMIN', p_admin_id, 'RESULTS.PUBLISHED', 'election', p_election_id::text,
    jsonb_build_object('tally_hash', v_hash, 'tied', v_top_count > 1), p_ip_hash);

  return query select r.candidate_id, r.vote_count, r.rank, r.is_winner, r.is_tied
                 from election_results r where r.election_id = p_election_id order by r.rank;
end $$;

-- ---------------------------------------------------------------------------
-- Audit chain verification
-- ---------------------------------------------------------------------------
create or replace function verify_audit_chain()
returns table (ok boolean, entries bigint, first_broken_id bigint)
language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  r record;
  v_prev text := repeat('0', 64);
  v_calc text;
  v_n bigint := 0;
begin
  for r in select * from audit_logs order by id loop
    v_n := v_n + 1;
    v_calc := encode(digest(
      v_prev || '|' || r.id::text || '|' || to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
      r.actor_type || '|' || coalesce(r.actor_admin_id::text, '') || '|' || r.action || '|' ||
      coalesce(r.entity_type, '') || '|' || coalesce(r.entity_id, '') || '|' || r.details::text, 'sha256'), 'hex');
    if r.prev_hash <> v_prev or r.entry_hash <> v_calc then
      ok := false; entries := v_n; first_broken_id := r.id;
      return next;
      return;
    end if;
    v_prev := r.entry_hash;
  end loop;
  ok := true; entries := v_n; first_broken_id := null;
  return next;
end $$;

-- Housekeeping (expired OTPs/sessions/rate-limit buckets). Never touches ballots.
create or replace function purge_expired_auth_material() returns void
language sql security definer
set search_path = public, extensions, pg_temp as $$
  delete from otp_verifications where expires_at < now() - interval '1 day';
  delete from voter_credentials where expires_at < now() - interval '1 day';
  delete from admin_sessions where expires_at < now() - interval '7 days';
  delete from rate_limit_buckets where window_start < now() - interval '1 day';
$$;
$tt_migration_2$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000002_election_functions.sql', 'c7a09eec8f007d227288e73dee2285fab6d1ca14e58c18893875a2a34a8bd665');
    raise notice 'applied 20261123000002_election_functions.sql';
  elsif prev <> 'c7a09eec8f007d227288e73dee2285fab6d1ca14e58c18893875a2a34a8bd665' then
    raise exception 'Migration 20261123000002_election_functions.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261123000003_access_control.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000003_access_control.sql';
  if prev is null then
    execute $tt_migration_3$-- =============================================================================
-- Database access control
--
--   techtitans_app   – the ONLY role the Next.js server uses (NOLOGIN group;
--                      a LOGIN role is made a member of it, see DEVELOPMENT.md)
--   anon / authenticated – Supabase client roles. They receive read access to
--                      public, non-sensitive data only. They can never write,
--                      and can never read students, ballots, participation,
--                      sessions, OTPs or audit records.
--
-- Voters and administrators are authenticated by the application (OTP / password
-- + TOTP). Their authority is enforced server-side and in the SECURITY DEFINER
-- functions; they never receive database credentials.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'techtitans_app') then
    create role techtitans_app nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to techtitans_app, anon, authenticated;
grant usage on schema extensions to techtitans_app;

-- Start from zero for every client role.
revoke all on all tables in schema public from techtitans_app, anon, authenticated;
revoke all on all sequences in schema public from techtitans_app, anon, authenticated;
-- Revoke default EXECUTE on this project's functions (not on extension functions
-- such as citext operators, which must stay callable).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Application server role
-- ---------------------------------------------------------------------------
grant select on admin_roles to techtitans_app;
grant select, insert, update on system_settings, election_admins, students, otp_verifications, disputes
  to techtitans_app;
grant select, insert, update, delete on admin_sessions, voter_credentials, election_positions, candidates,
  media_objects, rate_limit_buckets to techtitans_app;
grant select, insert, delete on elections to techtitans_app;
-- Column-level: the server cannot write verification/publication columns directly.
grant update (title, description, status, opens_at, closes_at, eligible_snapshot) on elections to techtitans_app;
grant select, insert on correction_requests to techtitans_app;
grant update (status) on correction_requests to techtitans_app; -- cancellation only (trigger-guarded)
grant select on voter_participation, election_results to techtitans_app;
grant select, insert on audit_logs to techtitans_app;
grant usage on sequence audit_logs_id_seq to techtitans_app;
-- NOTE: no privileges at all on `ballots`. Ballot access is only via functions.

grant execute on function
  cast_ballot(text, uuid),
  refresh_election_status(),
  eligible_voter_count(),
  ballot_totals(uuid),
  compute_tally(uuid),
  tally_hash(uuid),
  ballot_ledger(uuid),
  review_correction(uuid, uuid, boolean, text, text),
  verify_results(uuid, uuid, text),
  publish_results(uuid, uuid, text, text),
  verify_audit_chain(),
  append_audit(text, uuid, text, text, text, jsonb, text),
  admin_has_permission(uuid, text),
  hit_rate_limit(text, integer, integer),
  purge_expired_auth_material(),
  random_code(integer),
  setting_text(text, text)
to techtitans_app;

-- Cancellation: the server holds UPDATE on correction_requests.status only. It
-- cannot write reviewed_by, so the review_complete CHECK constraint makes it
-- impossible to move a request to APPROVED/REJECTED outside review_correction().

-- ---------------------------------------------------------------------------
-- Public (Supabase anon / authenticated) — read-only, non-sensitive columns.
-- ---------------------------------------------------------------------------
grant select (id, title, description, status, opens_at, closes_at, results_published_at) on elections to anon, authenticated;
grant select (id, election_id, display_name, introduction, manifesto, photo_path, status, display_order, position_id)
  on candidates to anon, authenticated;
grant select (id, election_id, code, title) on election_positions to anon, authenticated;
grant select on election_results to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security on every table.
-- The table owner (migrations / SECURITY DEFINER functions) bypasses RLS.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'system_settings', 'admin_roles', 'election_admins', 'admin_sessions', 'students', 'elections',
    'election_positions', 'candidates', 'otp_verifications', 'voter_credentials', 'voter_participation',
    'ballots', 'correction_requests', 'election_results', 'disputes', 'media_objects', 'rate_limit_buckets',
    'audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists app_server_access on %I', t);
    if t <> 'ballots' then
      execute format('create policy app_server_access on %I for all to techtitans_app using (true) with check (true)', t);
    end if;
  end loop;
end $$;

-- Audit log: the server may append and read, never rewrite (also trigger-guarded).
drop policy if exists app_server_access on audit_logs;
drop policy if exists audit_append on audit_logs;
drop policy if exists audit_read on audit_logs;
create policy audit_append on audit_logs for insert to techtitans_app with check (true);
create policy audit_read on audit_logs for select to techtitans_app using (true);

-- Public read policies
drop policy if exists public_read_elections on elections;
create policy public_read_elections on elections for select to anon, authenticated
  using (status <> 'DRAFT');

drop policy if exists public_read_positions on election_positions;
create policy public_read_positions on election_positions for select to anon, authenticated
  using (exists (select 1 from elections e where e.id = election_id and e.status <> 'DRAFT'));

drop policy if exists public_read_candidates on candidates;
create policy public_read_candidates on candidates for select to anon, authenticated
  using (status = 'APPROVED' and exists (select 1 from elections e where e.id = election_id and e.status <> 'DRAFT'));

drop policy if exists public_read_results on election_results;
create policy public_read_results on election_results for select to anon, authenticated
  using (exists (select 1 from elections e where e.id = election_id and e.status = 'RESULTS_PUBLISHED'));

-- ---------------------------------------------------------------------------
-- Reference data (not student data)
-- ---------------------------------------------------------------------------
insert into admin_roles (code, name, description, permissions) values
  ('SUPER_ADMIN', 'Super Admin', 'Full election configuration, admin management, corrections approval and result publication.',
    array['students.read','students.write','students.import','students.export',
          'candidates.read','candidates.write',
          'elections.read','elections.configure','elections.control',
          'results.view','results.verify','results.publish','ballots.read',
          'corrections.read','corrections.create','corrections.review',
          'disputes.read','disputes.manage','audit.read','admins.manage','settings.manage']),
  ('ELECTION_ADMIN', 'Election Admin', 'Student and candidate management, election monitoring, correction requests.',
    array['students.read','students.write','students.import','students.export',
          'candidates.read','candidates.write','elections.read','results.view',
          'corrections.read','corrections.create','ballots.read','disputes.read','disputes.manage']),
  ('RESULTS_OFFICER', 'Results Officer', 'Result verification; publication when explicitly authorised.',
    array['elections.read','candidates.read','results.view','results.verify','results.publish','ballots.read','corrections.read']),
  ('AUDITOR', 'Auditor', 'Read-only access to election reports and audit records.',
    array['elections.read','candidates.read','results.view','ballots.read','corrections.read','audit.read','disputes.read'])
on conflict (code) do update set name = excluded.name, description = excluded.description, permissions = excluded.permissions;

insert into system_settings (key, value, description) values
  ('election.batch', '"TechTitans-28"', 'Only students whose batch equals this value are eligible.'),
  ('election.department', '"Department of Information and Communication Technology"', 'Department name'),
  ('election.institution', '"Islamic University, Bangladesh"', 'Institution name'),
  ('committee.members', '[]', 'Election committee members shown publicly: [{name, designation, contact}]'),
  ('committee.contact', '{"email": "", "phone": "", "office": "ICT Department Office, Islamic University, Kushtia"}', 'Public help desk contact'),
  ('otp.ttl_seconds', '300', 'OTP validity window'),
  ('otp.max_attempts', '5', 'Maximum OTP verification attempts per challenge'),
  ('otp.resend_cooldown_seconds', '60', 'Minimum seconds between OTP requests for the same roll'),
  ('voter.session_minutes', '15', 'Voting session lifetime')
on conflict (key) do nothing;
$tt_migration_3$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000003_access_control.sql', '545617c367b89a29052b6aa08a725bc53aeef711372ac7a73133bca55e4d19f7');
    raise notice 'applied 20261123000003_access_control.sql';
  elsif prev <> '545617c367b89a29052b6aa08a725bc53aeef711372ac7a73133bca55e4d19f7' then
    raise exception 'Migration 20261123000003_access_control.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261123000004_supabase_platform.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000004_supabase_platform.sql';
  if prev is null then
    execute $tt_migration_4$-- =============================================================================
-- Supabase platform hardening & storage. Safe on plain PostgreSQL (every block
-- checks that the Supabase object exists first).
-- =============================================================================

-- service_role (the Supabase "service key") bypasses RLS through the Data API.
-- The application only uses that key for Storage, so it gets NO access to
-- election tables: a leaked service key cannot read or alter ballots,
-- participation, students or the audit log through PostgREST.
do $$
declare t text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach t in array array[
      'system_settings', 'admin_roles', 'election_admins', 'admin_sessions', 'students', 'elections',
      'election_positions', 'candidates', 'otp_verifications', 'voter_credentials', 'voter_participation',
      'ballots', 'correction_requests', 'election_results', 'disputes', 'media_objects', 'rate_limit_buckets',
      'audit_logs'
    ] loop
      execute format('revoke all on table %I from service_role', t);
    end loop;
    execute 'revoke all on all sequences in schema public from service_role';
    for t in
      select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    loop
      execute format('revoke execute on function %s from service_role', t);
    end loop;
  end if;
end $$;

-- Tables created by later migrations must not inherit Supabase's default
-- "grant all to anon, authenticated, service_role".
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke execute on functions from %I', r);
    end if;
  end loop;
end $$;

-- Storage buckets: public candidate photos (WebP only, written by the server
-- after re-encoding) and private correction evidence.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('candidate-photos', 'candidate-photos', true, 3145728, array['image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('correction-evidence', 'correction-evidence', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
$tt_migration_4$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000004_supabase_platform.sql', '422957fb6808a22d8c73dc2517f8d140344a5155c9d59ae26813157d3c96a297');
    raise notice 'applied 20261123000004_supabase_platform.sql';
  elsif prev <> '422957fb6808a22d8c73dc2517f8d140344a5155c9d59ae26813157d3c96a297' then
    raise exception 'Migration 20261123000004_supabase_platform.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261123000005_two_positions.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000005_two_positions.sql';
  if prev is null then
    execute $tt_migration_5$-- =============================================================================
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
$tt_migration_5$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000005_two_positions.sql', 'e661d7c537337e1077b47ba39bfcfe7d32fd6857ea4c50be47eabacfd1f3a423');
    raise notice 'applied 20261123000005_two_positions.sql';
  elsif prev <> 'e661d7c537337e1077b47ba39bfcfe7d32fd6857ea4c50be47eabacfd1f3a423' then
    raise exception 'Migration 20261123000005_two_positions.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261123000006_access_links.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000006_access_links.sql';
  if prev is null then
    execute $tt_migration_6$-- =============================================================================
-- Personal voting links: an authorised admin can give one student a private,
-- time-limited link (for a student whose email is missing or unreachable).
-- The student opens the link and confirms their roll number; the link then
-- signs them into the normal ballot. Only a hash of the link is stored.
-- A link never bypasses eligibility, the open-voting window or one-ballot-per-student.
-- =============================================================================
set search_path = public, extensions;

create table if not exists voter_access_links (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  student_id    uuid not null references students(id) on delete cascade,
  election_id   uuid not null references elections(id) on delete cascade,
  created_by    uuid not null,
  reason        text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  first_used_at timestamptz,
  revoked_at    timestamptz,
  check (expires_at > created_at)
);
create index if not exists idx_voter_access_links_student on voter_access_links(student_id, election_id);

alter table voter_access_links enable row level security;
drop policy if exists app_server_access on voter_access_links;
create policy app_server_access on voter_access_links for all to techtitans_app using (true) with check (true);
grant select, insert, update on voter_access_links to techtitans_app;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table voter_access_links from %I', r);
    end if;
  end loop;
end $$;
$tt_migration_6$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000006_access_links.sql', '91c95e2e087d3ca4853974433c8dee4ec17f9a5e0ab1ba3f99e39ef90e8c090f');
    raise notice 'applied 20261123000006_access_links.sql';
  elsif prev <> '91c95e2e087d3ca4853974433c8dee4ec17f9a5e0ab1ba3f99e39ef90e8c090f' then
    raise exception 'Migration 20261123000006_access_links.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261123000007_super_admin_election_window.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000007_super_admin_election_window.sql';
  if prev is null then
    execute $tt_migration_7$-- =============================================================================
-- Super Admin can change BOTH the start and end time of an election at any time
-- before it is closed (scheduled, live or paused). Everyone else keeps the old
-- rule (while voting is underway: only extend the closing time).
-- The change goes through admin_set_election_window(), which checks in the
-- database that the caller is an active Super Admin and writes the audit log.
-- Closed and published elections stay locked.
-- =============================================================================
set search_path = public, extensions;

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
    if old.status in ('LIVE', 'PAUSED')
       and coalesce(current_setting('app.election_window_override', true), '') <> 'on'
       and (new.opens_at is distinct from old.opens_at
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

create or replace function admin_set_election_window(
  p_election_id uuid, p_admin_id uuid, p_opens timestamptz, p_closes timestamptz, p_ip_hash text
) returns void
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  e elections%rowtype;
begin
  if not exists (select 1 from election_admins a where a.id = p_admin_id and a.is_active and a.mfa_enabled and a.role_code = 'SUPER_ADMIN') then
    raise exception 'FORBIDDEN: only a Super Admin can change the voting window' using errcode = 'P0001';
  end if;
  select * into e from elections where id = p_election_id for update;
  if e.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if e.status not in ('SCHEDULED', 'LIVE', 'PAUSED') then
    raise exception 'ELECTION_LOCKED: a closed election cannot be reconfigured' using errcode = 'P0001';
  end if;
  if p_closes <= p_opens then
    raise exception 'VALIDATION: the closing time must be after the opening time' using errcode = 'P0001';
  end if;
  if e.status in ('LIVE', 'PAUSED') then
    if p_closes <= now() then
      raise exception 'INVALID_STATE: while voting is underway the closing time must be in the future (to stop voting now use "Close voting")' using errcode = 'P0001';
    end if;
    if p_opens > now() then
      raise exception 'INVALID_STATE: voting has already started, so the start time cannot be in the future' using errcode = 'P0001';
    end if;
  end if;
  perform set_config('app.election_window_override', 'on', true);
  update elections set opens_at = p_opens, closes_at = p_closes where id = p_election_id;
  perform set_config('app.election_window_override', 'off', true);
  perform append_audit('ADMIN', p_admin_id, 'ELECTION.WINDOW_CHANGED', 'election', p_election_id::text,
    jsonb_build_object('status', e.status, 'before', jsonb_build_object('opens_at', e.opens_at, 'closes_at', e.closes_at),
                       'after', jsonb_build_object('opens_at', p_opens, 'closes_at', p_closes)), p_ip_hash);
end $$;

do $$
declare r text;
begin
  revoke all on function admin_set_election_window(uuid, uuid, timestamptz, timestamptz, text) from public;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function admin_set_election_window(uuid, uuid, timestamptz, timestamptz, text) from %I', r);
    end if;
  end loop;
  grant execute on function admin_set_election_window(uuid, uuid, timestamptz, timestamptz, text) to techtitans_app;
end $$;
$tt_migration_7$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000007_super_admin_election_window.sql', '59945e90c63a4243fced9be09c1a39e8923bd1238b27899f3e74c595d435e5e0');
    raise notice 'applied 20261123000007_super_admin_election_window.sql';
  elsif prev <> '59945e90c63a4243fced9be09c1a39e8923bd1238b27899f3e74c595d435e5e0' then
    raise exception 'Migration 20261123000007_super_admin_election_window.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- 20261123000008_open_ballot.sql
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '20261123000008_open_ballot.sql';
  if prev is null then
    execute $tt_migration_8$-- =============================================================================
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
$tt_migration_8$;
    insert into public.schema_migrations (filename, checksum) values ('20261123000008_open_ballot.sql', '96c93e64326aaf33f66f1285c6ea6926c496673cf4146713395523458577c5d8');
    raise notice 'applied 20261123000008_open_ballot.sql';
  elsif prev <> '96c93e64326aaf33f66f1285c6ea6926c496673cf4146713395523458577c5d8' then
    raise exception 'Migration 20261123000008_open_ballot.sql was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;

-- ---------------------------------------------------------------------------
-- Application login role (member of techtitans_app). Created once with a random
-- password, which is shown in the result below. Existing role is left untouched.
-- ---------------------------------------------------------------------------
create temp table if not exists tt_deploy_output (item text, value text) on commit preserve rows;
truncate tt_deploy_output;
do $tt$
declare pw text;
begin
  if not exists (select 1 from pg_roles where rolname = 'techtitans_app_user') then
    pw := encode(extensions.gen_random_bytes(24), 'hex');
    execute format('create role techtitans_app_user login password %L', pw);
    insert into tt_deploy_output values ('db_user', 'techtitans_app_user'), ('db_password (copy now, shown once)', pw);
  else
    insert into tt_deploy_output values ('db_user', 'techtitans_app_user (already existed — password unchanged)');
  end if;
end $tt$;
grant techtitans_app to techtitans_app_user;
alter role techtitans_app_user set search_path = public, extensions;

insert into tt_deploy_output
select 'migrations applied', string_agg(filename, ', ' order by filename) from public.schema_migrations;
do $tt$ begin
  if to_regclass('storage.buckets') is not null then
    insert into tt_deploy_output
    select 'storage buckets', coalesce(string_agg(id || case when public then ' (public)' else ' (private)' end, ', '), 'none')
      from storage.buckets where id in ('candidate-photos', 'correction-evidence');
  else
    insert into tt_deploy_output values ('storage buckets', 'storage schema not found (not a Supabase database)');
  end if;
end $tt$;
insert into tt_deploy_output
select 'two-race voting', case when to_regprocedure('public.cast_ballot(text, uuid[])') is not null then 'ready (Boys'' CR + Girls'' CR)' else 'MISSING' end;
insert into tt_deploy_output
select 'audit chain', case when ok then 'intact' else 'BROKEN' end from public.verify_audit_chain();

commit;

select item, value from tt_deploy_output;
