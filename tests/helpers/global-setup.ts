import { Client } from "pg";
import { migrate } from "../../scripts/migrate";

/** Recreates the test database from migrations before the suite runs. */
export default async function setup() {
  const base = process.env.TEST_PG_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432";
  const admin = new Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = 'techtitans_test' and pid <> pg_backend_pid()`);
  await admin.query("drop database if exists techtitans_test");
  await admin.query("create database techtitans_test");
  await admin.end();
  await migrate(`${base}/techtitans_test`, () => {});
  const owner = new Client({ connectionString: `${base}/techtitans_test` });
  await owner.connect();
  await owner.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'techtitans_app_user') then
        create role techtitans_app_user login password 'test_app_password';
      end if;
    end $$`);
  await owner.query("grant techtitans_app to techtitans_app_user");
  await owner.end();
}
