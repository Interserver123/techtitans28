import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { requestOtp, verifyOtp, getVoterSession } from "@/lib/services/voter-auth";
import { devOutbox } from "@/lib/otp/provider";
import { query, one } from "@/lib/db";
import { asOwner, ctx, makeElection, makeStudent, resetVolatile, setElectionStatus, teardown } from "./helpers/fixtures";

async function requestAndRead(roll: string, ip?: string) {
  const r = await requestOtp(roll, ctx(ip));
  await r.deliver();
  return { challengeId: r.challengeId, code: devOutbox()[0]?.code };
}

describe("student authentication (roll + OTP)", () => {
  beforeEach(resetVolatile);
  afterAll(teardown);

  it("valid roll: sends OTP, verifies, mints a session", async () => {
    await makeElection();
    const s = await makeStudent();
    const { challengeId, code } = await requestAndRead(s.roll);
    expect(code).toMatch(/^\d{6}$/);
    const { token } = await verifyOtp(challengeId, code, ctx());
    const session = await getVoterSession(token);
    expect(session?.studentId).toBe(s.id);
    expect(session?.hasVoted).toBe(false);
  });

  it("OTP values are never stored in plaintext", async () => {
    await makeElection();
    const s = await makeStudent();
    const { code } = await requestAndRead(s.roll);
    const rows = await query<{ code_hash: string }>(`select code_hash from otp_verifications where student_id = $1`, [s.id]);
    expect(rows.length).toBe(1);
    expect(rows[0].code_hash).not.toContain(code);
    expect(rows[0].code_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("unknown / ineligible rolls get an indistinguishable response and no OTP", async () => {
    await makeElection();
    const ineligible = await makeStudent({ batch: "TechTitans-27" });
    const inactive = await makeStudent({ active: false });
    for (const roll of ["NOSUCH999", ineligible.roll, inactive.roll]) {
      devOutbox().splice(0);
      const r = await requestOtp(roll, ctx());
      await r.deliver();
      expect(Object.keys(r).sort()).toEqual(["challengeId", "deliver"]);
      expect(r.challengeId).toHaveLength(43);
      expect(devOutbox()).toHaveLength(0);
      await expect(verifyOtp(r.challengeId, "123456", ctx())).rejects.toMatchObject({ code: "INVALID_OTP" });
    }
  });

  it("rejects an invalid OTP and locks after the attempt limit", async () => {
    await makeElection();
    const s = await makeStudent();
    const { challengeId, code } = await requestAndRead(s.roll);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) {
      await expect(verifyOtp(challengeId, wrong, ctx())).rejects.toMatchObject({ code: "INVALID_OTP" });
    }
    await expect(verifyOtp(challengeId, wrong, ctx())).rejects.toMatchObject({ code: "OTP_LOCKED" });
    // Even the correct code is refused once locked.
    await expect(verifyOtp(challengeId, code, ctx())).rejects.toMatchObject({ code: "OTP_LOCKED" });
  });

  it("rejects an expired OTP", async () => {
    await makeElection();
    const s = await makeStudent();
    const { challengeId, code } = await requestAndRead(s.roll);
    await query(`update otp_verifications set expires_at = now() - interval '1 second' where student_id = $1`, [s.id]);
    await expect(verifyOtp(challengeId, code, ctx())).rejects.toMatchObject({ code: "INVALID_OTP" });
  });

  it("an OTP is single-use, even under concurrent verification", async () => {
    await makeElection();
    const s = await makeStudent();
    const { challengeId, code } = await requestAndRead(s.roll);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => verifyOtp(challengeId, code, ctx())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("requesting a new code invalidates the previous one", async () => {
    await makeElection();
    const s = await makeStudent();
    const first = await requestAndRead(s.roll);
    await query("delete from rate_limit_buckets");
    const second = await requestAndRead(s.roll);
    await expect(verifyOtp(first.challengeId, first.code, ctx())).rejects.toMatchObject({ code: "INVALID_OTP" });
    await expect(verifyOtp(second.challengeId, second.code, ctx())).resolves.toHaveProperty("token");
  });

  it("enforces the resend cooldown regardless of whether the roll exists", async () => {
    await makeElection();
    const s = await makeStudent();
    await requestOtp(s.roll, ctx());
    await expect(requestOtp(s.roll, ctx())).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await requestOtp("GHOST123", ctx());
    await expect(requestOtp("GHOST123", ctx())).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("rate-limits OTP requests per IP", async () => {
    await makeElection();
    for (let i = 0; i < 300; i++) await requestOtp(`FLOOD${i}`, ctx("198.51.100.7"));
    await expect(requestOtp("FLOOD99", ctx("198.51.100.7"))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("refuses OTP requests when the election is not open", async () => {
    const { electionId } = await makeElection({ status: "PAUSED" });
    const s = await makeStudent();
    await expect(requestOtp(s.roll, ctx())).rejects.toMatchObject({ code: "ELECTION_PAUSED" });
    await setElectionStatus(electionId, "CLOSED");
    await expect(requestOtp(s.roll, ctx())).rejects.toMatchObject({ code: "ELECTION_CLOSED" });
    await makeElection({ status: "SCHEDULED", opensInMin: 60, closesInMin: 120 });
    await expect(requestOtp(s.roll, ctx())).rejects.toMatchObject({ code: "ELECTION_NOT_OPEN" });
  });

  it("unauthorised / tampered session tokens resolve to no session", async () => {
    expect(await getVoterSession(undefined)).toBeNull();
    expect(await getVoterSession("forged-token")).toBeNull();
    expect(await getVoterSession("x".repeat(500))).toBeNull();
  });

  it("verifying again revokes the previous voting session (fixation defence)", async () => {
    await makeElection();
    const s = await makeStudent();
    const a = await requestAndRead(s.roll);
    const first = await verifyOtp(a.challengeId, a.code, ctx());
    await query("delete from rate_limit_buckets");
    const b = await requestAndRead(s.roll);
    const second = await verifyOtp(b.challengeId, b.code, ctx());
    expect(await getVoterSession(first.token)).toBeNull();
    expect(await getVoterSession(second.token)).not.toBeNull();
  });

  it("session expiry is enforced", async () => {
    await makeElection();
    const s = await makeStudent();
    const a = await requestAndRead(s.roll);
    const { token } = await verifyOtp(a.challengeId, a.code, ctx());
    await asOwner((c) => c.query(`update voter_credentials set created_at = now() - interval '1 hour', expires_at = now() - interval '1 second' where student_id = $1`, [s.id]));
    expect(await getVoterSession(token)).toBeNull();
    const count = await one<{ n: number }>(`select count(*)::int as n from voter_credentials where student_id = $1`, [s.id]);
    expect(count?.n).toBe(1);
  });
});
