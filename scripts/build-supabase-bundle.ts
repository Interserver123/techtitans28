/**
 * Builds supabase/deploy.sql: every migration in one idempotent script that can be
 * pasted into the Supabase dashboard (SQL Editor → Run). Each migration is applied
 * only if it is not yet recorded in schema_migrations (same checksums as
 * scripts/migrate.ts, so both tools can be mixed). Re-run: npm run supabase:bundle
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

let out = `-- =============================================================================
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
`;

files.forEach((file, i) => {
  const sql = readFileSync(path.join(dir, file), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const tag = `$tt_migration_${i + 1}$`;
  if (sql.includes(tag)) throw new Error(`${file} contains the reserved quote tag ${tag}`);
  out += `
-- ---------------------------------------------------------------------------
-- ${file}
-- ---------------------------------------------------------------------------
do $tt_wrap$
declare prev text;
begin
  select checksum into prev from public.schema_migrations where filename = '${file}';
  if prev is null then
    execute ${tag}${sql}${tag};
    insert into public.schema_migrations (filename, checksum) values ('${file}', '${checksum}');
    raise notice 'applied ${file}';
  elsif prev <> '${checksum}' then
    raise exception 'Migration ${file} was already applied with different contents. Create a new migration instead.';
  end if;
end $tt_wrap$;
`;
});

out += `
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
insert into tt_deploy_output
select 'storage buckets', coalesce((select string_agg(id || case when public then ' (public)' else ' (private)' end, ', ')
  from storage.buckets where id in ('candidate-photos', 'correction-evidence')), 'storage schema not found');
insert into tt_deploy_output
select 'audit chain', case when ok then 'intact' else 'BROKEN' end from public.verify_audit_chain();

commit;

select item, value from tt_deploy_output;
`;

writeFileSync(path.join(process.cwd(), "supabase", "deploy.sql"), out);
console.log(`✓ supabase/deploy.sql written (${files.length} migrations)`);
