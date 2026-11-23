#!/usr/bin/env bash
# Creates a local development database, applies migrations and creates the
# application LOGIN role (member of techtitans_app). For local use only.
set -euo pipefail
PG_ADMIN_URL="${PG_ADMIN_URL:-postgres://postgres:postgres@localhost:5432}"
DB_NAME="${DB_NAME:-techtitans}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:-dev_app_password}"

psql "$PG_ADMIN_URL/postgres" -tAc "select 1 from pg_database where datname = '$DB_NAME'" | grep -q 1 \
  || psql "$PG_ADMIN_URL/postgres" -c "create database $DB_NAME"
MIGRATION_DATABASE_URL="$PG_ADMIN_URL/$DB_NAME" npx tsx scripts/migrate.ts
psql "$PG_ADMIN_URL/$DB_NAME" -v ON_ERROR_STOP=1 -v pw="$APP_DB_PASSWORD" <<'SQL'
select format('create role techtitans_app_user login password %L', :'pw')
 where not exists (select 1 from pg_roles where rolname = 'techtitans_app_user') \gexec
grant techtitans_app to techtitans_app_user;
SQL
echo "✓ local database ready: postgres://techtitans_app_user:${APP_DB_PASSWORD}@localhost:5432/$DB_NAME"
