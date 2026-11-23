-- =============================================================================
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
