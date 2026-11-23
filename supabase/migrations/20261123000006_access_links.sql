-- =============================================================================
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
