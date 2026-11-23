-- =============================================================================
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
