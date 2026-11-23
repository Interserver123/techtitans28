import { Client } from "pg";
import { configProblems, env } from "@/lib/env";
import { otpStatus } from "@/lib/otp/provider";

/**
 * Deployment self-check. Reports WHICH setting or step is wrong — never secret values.
 *   GET /api/health  →  200 when configuration, database connection and schema are OK, else 503.
 */
export async function GET() {
  const problems = configProblems();
  const report: Record<string, unknown> = {
    ok: false,
    // Set automatically by Vercel for Git deployments; shows which commit is live.
    deployment: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      environment: process.env.VERCEL_ENV ?? null,
    },
    config: problems.length ? { ok: false, problems } : { ok: true },
    // Which verification-code channels are on ("dev" means codes are not sent to anyone).
    otp: otpStatus(),
  };
  if (problems.some((p) => p.variable === "DATABASE_URL")) {
    report.database = { ok: false, hint: "Set DATABASE_URL first." };
    return Response.json(report, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const url = process.env.DATABASE_URL ?? "";
  let sslMode = "disable";
  try {
    sslMode = problems.length ? (process.env.DATABASE_SSL || "require") : env().DATABASE_SSL;
  } catch {
    /* fall through with the guess above */
  }
  const client = new Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ""),
    ssl: sslMode === "disable" ? undefined : { rejectUnauthorized: sslMode === "verify", ca: process.env.DATABASE_CA_CERT || undefined },
    connectionTimeoutMillis: 8000,
    statement_timeout: 8000,
  });
  try {
    await client.connect();
    const who = await client.query<{ usr: string; app: boolean }>(
      `select current_user as usr, pg_has_role(current_user, 'techtitans_app', 'member') as app`,
    ).catch(() => ({ rows: [{ usr: "?", app: false }] }));
    const schema = await client.query<{ ok: boolean }>(`select to_regclass('public.elections') is not null as ok`)
      .catch(() => ({ rows: [{ ok: false }] }));
    const role = who.rows[0];
    const db: Record<string, unknown> = { ok: true, connectedAs: role.usr.replace(/\..*$/, "") };
    if (!schema.rows[0].ok) {
      db.ok = false;
      db.hint = "Connected, but the election schema is missing: run supabase/deploy.sql in the Supabase SQL Editor.";
    } else if (!role.app) {
      db.ok = false;
      db.hint = "Connected with a role that is not a member of techtitans_app. Use techtitans_app_user (created by deploy.sql) in DATABASE_URL, not postgres.";
    } else {
      const probe = await client.query("select public.eligible_voter_count() as n").then(() => true).catch(() => false);
      if (!probe) {
        db.ok = false;
        db.hint = "The app role cannot execute the election functions. Re-run supabase/deploy.sql.";
      }
      // Two-race voting (Boys' CR + Girls' CR) needs migration 5: the ballot function takes both choices.
      const twoRaces = await client
        .query<{ ok: boolean }>(`select has_function_privilege(current_user, 'public.cast_ballot(text, uuid[])', 'execute') as ok`)
        .then((r) => r.rows[0]?.ok === true)
        .catch(() => false);
      // Two-person vote corrections, step-up MFA and verifiable exports need migration 9. Voting works without
      // it, so this is reported but does not fail the check; the admin pages explain what is blocked.
      const adminControls = await client
        .query<{ ok: boolean }>(`select to_regprocedure('public.request_choice_change(text, uuid, uuid, uuid, uuid, text, text, text)') is not null as ok`)
        .then((r) => r.rows[0]?.ok === true)
        .catch(() => false);
      if (probe && !adminControls) {
        db.pendingUpgrade = "Admin controls (two-person vote corrections, step-up MFA, record exports) need the latest supabase/deploy.sql. Voting is unaffected.";
      }
      if (probe && !twoRaces) {
        db.ok = false;
        db.hint = "The database is missing the two-race voting upgrade (Boys' CR + Girls' CR). Run the latest supabase/deploy.sql in the Supabase SQL Editor.";
      }
    }
    report.database = db;
  } catch (err) {
    report.database = { ok: false, ...explain(err as { code?: string; message?: string }) };
  } finally {
    await client.end().catch(() => {});
  }
  report.ok = (report.config as { ok: boolean }).ok && (report.database as { ok: boolean }).ok;
  return Response.json(report, { status: report.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

function explain(e: { code?: string; message?: string }) {
  const m = e.message ?? "";
  if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") return { error: "host_not_found", hint: "The database host in DATABASE_URL does not resolve. Copy the Transaction pooler string from Supabase → Project Settings → Database." };
  if (e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT" || /timeout/i.test(m)) return { error: "unreachable", hint: "Cannot reach the database. Use the pooler host (…pooler.supabase.com) and port 6543." };
  if (e.code === "28P01" || /password authentication failed/i.test(m)) return { error: "bad_password", hint: "Wrong database password. Use the db_password printed by deploy.sql for techtitans_app_user." };
  if (/tenant or user not found/i.test(m)) return { error: "pooler_user_format", hint: "Supabase pooler usernames must be techtitans_app_user.<project-ref> (note the dot and project ref)." };
  if (/self[- ]signed|certificate/i.test(m)) return { error: "tls_certificate", hint: "TLS verification failed. Set DATABASE_SSL=require, or DATABASE_SSL=verify with DATABASE_CA_CERT set to Supabase's CA certificate." };
  if (/ssl|tls/i.test(m)) return { error: "tls", hint: "TLS negotiation failed. Set DATABASE_SSL=require." };
  if (e.code === "3D000") return { error: "database_missing", hint: "The database name in DATABASE_URL does not exist (Supabase uses /postgres)." };
  return { error: e.code ?? "connection_failed", hint: "Could not connect to the database. Check DATABASE_URL." };
}
