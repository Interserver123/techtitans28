/**
 * Applies SQL migrations from supabase/migrations in filename order.
 * Uses MIGRATION_DATABASE_URL (a schema-owner connection), never the app role.
 * Each migration runs in its own transaction and is recorded with a checksum;
 * an edited, already-applied migration aborts the run.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { Client } from "pg";

export async function migrate(connectionString: string, log = console.log) {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`create table if not exists schema_migrations (
      filename text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    await client.query("revoke all on schema_migrations from public");
    const applied = new Map<string, string>(
      (await client.query("select filename, checksum from schema_migrations")).rows.map((r) => [r.filename, r.checksum]),
    );
    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const prev = applied.get(file);
      if (prev) {
        if (prev !== checksum) throw new Error(`Migration ${file} was modified after being applied. Create a new migration instead.`);
        continue;
      }
      log(`→ applying ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename, checksum) values ($1, $2)", [file, checksum]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    log("✓ database schema is up to date");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error("MIGRATION_DATABASE_URL is required");
    process.exit(1);
  }
  migrate(url).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
