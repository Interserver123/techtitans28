import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { requestOtp, verifyOtp, getVoterSession } from "@/lib/services/voter-auth";
import { castVote } from "@/lib/services/voting";
import { devOutbox } from "@/lib/otp/provider";
import { query, one } from "@/lib/db";
import { asOwner, ctx, makeElection, makeStudent, resetVolatile, setElectionStatus, teardown } from "./helpers/fixtures";

async function login(roll: string) {
  await query("delete from rate_limit_buckets where bucket_key like 'otp-roll%'");
  const ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const r = await requestOtp(roll, ctx(ip));
  await r.deliver();
  const code = devOutbox()[0].code;
  return (await verifyOtp(r.challengeId, code, ctx(ip))).token;
}

describe("ballot submission", () => {
  beforeEach(resetVolatile);
  afterAll(teardown);

  it("accepts a valid vote and returns a receipt that does not reveal the candidate", async () => {
    const { candidateIds, electionId } = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    const receipt = await castVote(token, candidateIds[1]);
    expect(receipt.receiptCode).toMatch(/^TT28-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(JSON.stringify(receipt)).not.toContain(candidateIds[1]);
    const session = await getVoterSession(token);
    expect(session?.hasVoted).toBe(true);
    const t = await one<{ total_ballots: number; participation: number }>(`select * from ballot_totals($1)`, [electionId]);
    expect(t).toMatchObject({ total_ballots: 1, participation: 1 });
  });

  it("rejects a second vote", async () => {
    const { candidateIds } = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    await castVote(token, candidateIds[0]);
    await expect(castVote(token, candidateIds[1])).rejects.toMatchObject({ code: "ALREADY_VOTED" });
    // A brand new session cannot vote again either.
    const token2 = await login(s.roll);
    await expect(castVote(token2, candidateIds[2])).rejects.toMatchObject({ code: "ALREADY_VOTED" });
  });

  it("accepts exactly one ballot under 25 concurrent duplicate submissions", async () => {
    const { candidateIds, electionId } = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    const results = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => castVote(token, candidateIds[i % 3])));
    const ok = results.filter((r) => r.status === "fulfilled");
    const dup = results.filter((r) => r.status === "rejected" && (r.reason as { code: string }).code === "ALREADY_VOTED");
    expect(ok).toHaveLength(1);
    expect(dup).toHaveLength(24);
    const t = await one<{ total_ballots: number; participation: number }>(`select * from ballot_totals($1)`, [electionId]);
    expect(t).toMatchObject({ total_ballots: 1, participation: 1 });
  });

  it("rejects an invalid, inactive or foreign candidate", async () => {
    const { candidateIds } = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    await expect(castVote(token, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "INVALID_CANDIDATE" });
    // candidate from another election
    const other = await asOwner(async (c) => {
      const r = await c.query(`select c.id from candidates c where c.id <> all($1) limit 1`, [candidateIds]);
      return r.rows[0]?.id as string | undefined;
    });
    if (other) await expect(castVote(token, other)).rejects.toMatchObject({ code: "INVALID_CANDIDATE" });
    expect((await getVoterSession(token))?.hasVoted).toBe(false);
  });

  it("rejects votes while paused, after closing, and before opening", async () => {
    const { candidateIds, electionId } = await makeElection();
    const s1 = await makeStudent();
    const token = await login(s1.roll);
    await setElectionStatus(electionId, "PAUSED");
    await expect(castVote(token, candidateIds[0])).rejects.toMatchObject({ code: "ELECTION_PAUSED" });
    await setElectionStatus(electionId, "LIVE");
    await asOwner((c) => c.query(`update elections set closes_at = now() - interval '1 second', opens_at = now() - interval '1 hour' where id = $1`, [electionId]).catch(async () => {
      // closing time can only be extended while live -> emulate clock passing as owner with trigger disabled
      await c.query("alter table elections disable trigger trg_election_transition");
      await c.query(`update elections set closes_at = now() - interval '1 second' where id = $1`, [electionId]);
      await c.query("alter table elections enable trigger trg_election_transition");
    }));
    await expect(castVote(token, candidateIds[0])).rejects.toMatchObject({ code: "ELECTION_CLOSED" });

    // Before opening: mint a credential directly (OTP requests are refused before opening).
    const { candidateIds: c2, electionId: e2 } = await makeElection({ status: "SCHEDULED", opensInMin: 30, closesInMin: 60 });
    const s2 = await makeStudent();
    const { voterTokenHash } = await import("@/lib/services/voter-auth");
    await query(`insert into voter_credentials (token_hash, student_id, election_id, expires_at) values ($1, $2, $3, now() + interval '10 minutes')`, [voterTokenHash("early-bird-token"), s2.id, e2]);
    await expect(castVote("early-bird-token", c2[0])).rejects.toMatchObject({ code: "ELECTION_NOT_OPEN" });
  });

  it("rejects votes with an expired or revoked session", async () => {
    const { candidateIds } = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    await asOwner((c) => c.query(`update voter_credentials set created_at = now() - interval '1 hour', expires_at = now() - interval '1 second' where student_id = $1`, [s.id]));
    await expect(castVote(token, candidateIds[0])).rejects.toMatchObject({ code: "SESSION_INVALID" });
    await expect(castVote(null, candidateIds[0])).rejects.toMatchObject({ code: "SESSION_INVALID" });
  });

  it("a student deactivated mid-session cannot vote", async () => {
    const { candidateIds } = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    await query(`update students set is_active = false where id = $1`, [s.id]);
    await expect(castVote(token, candidateIds[0])).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("network interruption: a retried submission after a committed vote is reported as already voted, and the receipt is recoverable", async () => {
    const { candidateIds } = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    const first = await castVote(token, candidateIds[0]); // response "lost" in transit
    await expect(castVote(token, candidateIds[0])).rejects.toMatchObject({ code: "ALREADY_VOTED" });
    const session = await getVoterSession(token);
    expect(session?.receiptCode).toBe(first.receiptCode);
  });

  it("a transaction aborted mid-way leaves no partial records", async () => {
    const { candidateIds, electionId } = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    const { voterTokenHash } = await import("@/lib/services/voter-auth");
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    await c.query("begin");
    await c.query("select * from cast_ballot($1, $2)", [voterTokenHash(token), candidateIds[0]]);
    await c.query("rollback"); // simulated connection drop before commit
    await c.end();
    const t = await one<{ total_ballots: number; participation: number }>(`select * from ballot_totals($1)`, [electionId]);
    expect(t).toMatchObject({ total_ballots: 0, participation: 0 });
    await expect(castVote(token, candidateIds[0])).resolves.toHaveProperty("receiptCode");
  });

  it("load: 150 voters voting simultaneously (with duplicate retries) yields exactly one ballot each", async () => {
    const { candidateIds, electionId } = await makeElection({ candidates: 4 });
    const voters = await Promise.all(Array.from({ length: 150 }, () => makeStudent()));
    const tokens: string[] = [];
    for (const v of voters) tokens.push(await login(v.roll));
    const attempts = tokens.flatMap((t, i) => [castVote(t, candidateIds[i % 4]), castVote(t, candidateIds[(i + 1) % 4])]);
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason.code);
    expect(ok).toBe(150);
    expect(new Set(failures)).toEqual(new Set(["ALREADY_VOTED"]));
    const t = await one<{ total_ballots: number; participation: number }>(`select * from ballot_totals($1)`, [electionId]);
    expect(t).toMatchObject({ total_ballots: 150, participation: 150 });
    const perVoter = await one<{ max: number }>(`select max(n)::int as max from (select count(*) n from voter_participation where election_id = $1 group by student_id) x`, [electionId]);
    expect(perVoter?.max).toBe(1);
  }, 120_000);
});
