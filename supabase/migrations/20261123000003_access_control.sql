-- =============================================================================
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
