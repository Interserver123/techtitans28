import { Client } from "pg";
import * as OTPAuth from "otpauth";
import { closePool, query, one } from "@/lib/db";
import { devOutbox } from "@/lib/otp/provider";
import type { RequestContext } from "@/lib/http";

export const ctx = (ip = "203.0.113.10"): RequestContext => ({ ip, ipHash: `iphash-${ip}`, userAgent: "vitest" });

/** Owner connection — only for test arrangement that the app role cannot do (e.g. clock travel). */
export async function asOwner<T>(fn: (c: Client) => Promise<T>) {
  const c = new Client({ connectionString: process.env.TEST_OWNER_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

let seq = 0;
export const uniq = () => `${Date.now().toString(36).slice(-4).toUpperCase()}${(seq++).toString(36).toUpperCase()}`;

export async function resetVolatile() {
  await query("delete from rate_limit_buckets");
  devOutbox().splice(0);
}

export async function makeStudent(over: Partial<{ roll: string; batch: string; active: boolean; eligible: boolean; email: string; gender: "MALE" | "FEMALE" | null }> = {}) {
  const roll = over.roll ?? `T${uniq()}`;
  const row = await one<{ id: string }>(
    `insert into students (roll_number, full_name, contact_type, contact_value, batch, is_active, is_eligible, gender, is_dev_seed)
     values ($1, $2, 'EMAIL', $3, $4, $5, $6, $7, true) returning id`,
    [roll, `Test Student ${roll}`, over.email ?? `${roll.toLowerCase()}@students.test`, over.batch ?? "TechTitans-28", over.active ?? true, over.eligible ?? true, over.gender === undefined ? "MALE" : over.gender],
  );
  return { id: row!.id, roll };
}

export async function makeAdmin(role: "SUPER_ADMIN" | "ELECTION_ADMIN" | "RESULTS_OFFICER" | "AUDITOR", opts: { canPublish?: boolean } = {}) {
  const { hashPassword, encrypt } = await import("@/lib/crypto");
  const secret = new OTPAuth.Secret({ size: 20 });
  const email = `${role.toLowerCase()}-${uniq().toLowerCase()}@committee.test`;
  const password = "Correct-Horse-42";
  const row = await one<{ id: string }>(
    `insert into election_admins (email, full_name, role_code, password_hash, mfa_secret_enc, mfa_enabled, can_publish_results)
     values ($1, $2, $3, $4, $5, true, $6) returning id`,
    [email, `${role} Tester`, role, await hashPassword(password), encrypt(secret.base32), opts.canPublish ?? false],
  );
  const totp = new OTPAuth.TOTP({ secret, digits: 6, period: 30, algorithm: "SHA1" });
  return { id: row!.id, email, password, totp: (offsetSteps = 0) => totp.generate({ timestamp: Date.now() + offsetSteps * 30_000 }) };
}

/**
 * Creates an election with TWO races (Boys' CR + Girls' CR) and approved candidates in each.
 * `ballot(i, j)` returns a valid pair: boy i + girl j.
 */
export async function makeElection(opts: { status?: string; boys?: number; girls?: number; opensInMin?: number; closesInMin?: number } = {}) {
  await asOwner(async (c) => {
    // Only one active election may exist; retire any active ones from previous tests.
    await c.query(`update elections set status = 'CLOSED' where status in ('SCHEDULED','LIVE','PAUSED')`);
  });
  const e = await one<{ id: string }>(
    `insert into elections (title, opens_at, closes_at) values ($1, now() + make_interval(mins => $2), now() + make_interval(mins => $3)) returning id`,
    [`Test Election ${uniq()}`, opts.opensInMin ?? -5, opts.closesInMin ?? 120],
  );
  const boysPos = await one<{ id: string }>(`insert into election_positions (election_id, code, title, gender, display_order) values ($1, 'CR_BOYS', 'Boys'' Class Representative', 'MALE', 1) returning id`, [e!.id]);
  const girlsPos = await one<{ id: string }>(`insert into election_positions (election_id, code, title, gender, display_order) values ($1, 'CR_GIRLS', 'Girls'' Class Representative', 'FEMALE', 2) returning id`, [e!.id]);
  const mk = async (n: number, pos: string, gender: "MALE" | "FEMALE", label: string) => {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const st = await makeStudent({ gender });
      const c = await one<{ id: string }>(
        `insert into candidates (election_id, position_id, student_id, display_name, status, display_order) values ($1, $2, $3, $4, 'APPROVED', $5) returning id`,
        [e!.id, pos, st.id, `${label} ${i + 1}`, i],
      );
      ids.push(c!.id);
    }
    return ids;
  };
  const boys = await mk(opts.boys ?? 3, boysPos!.id, "MALE", "Boy");
  const girls = await mk(opts.girls ?? 3, girlsPos!.id, "FEMALE", "Girl");
  const target = opts.status ?? "LIVE";
  const path: Record<string, string[]> = {
    DRAFT: [], SCHEDULED: ["SCHEDULED"], LIVE: ["SCHEDULED", "LIVE"], PAUSED: ["SCHEDULED", "LIVE", "PAUSED"], CLOSED: ["SCHEDULED", "LIVE", "CLOSED"],
  };
  for (const st of path[target]) await query(`update elections set status = $2 where id = $1`, [e!.id, st]);
  return {
    electionId: e!.id, boysPositionId: boysPos!.id, girlsPositionId: girlsPos!.id, boys, girls,
    ballot: (i = 0, j = 0) => [boys[i], girls[j]],
  };
}

export async function setElectionStatus(id: string, status: string) {
  await query(`update elections set status = $2 where id = $1`, [id, status]);
}

export async function teardown() {
  await closePool();
}

/**
 * A live, MFA-verified admin session (as after sign-in). `stepUp` marks a fresh authenticator code,
 * which the voter-linked database functions require. Returns the token and its stored hash.
 */
export async function sessionFor(adminId: string, opts: { stepUp?: boolean } = {}) {
  const { adminTokenHash } = await import("@/lib/services/admin-auth");
  const token = `test-session-${uniq()}-${Math.random().toString(36).slice(2)}`;
  const hash = adminTokenHash(token);
  await query(
    `insert into admin_sessions (admin_id, token_hash, mfa_verified, expires_at, mfa_stepup_at)
     values ($1, $2, true, now() + interval '1 hour', case when $3 then now() end)`,
    [adminId, hash, opts.stepUp ?? true],
  );
  return { token, hash };
}
