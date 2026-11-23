import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminLogin, completeMfa, getAdminIdentity, requireAdmin, beginMfaEnrollment } from "@/lib/services/admin-auth";
import { createAdmin } from "@/lib/services/admins";
import { transitionElection, createElection } from "@/lib/services/elections";
import { createCorrection, reviewCorrection, cancelCorrection } from "@/lib/services/corrections";
import { getResultSummary, verifyResults, publishResults, getPublishedResults, getBallotLedger } from "@/lib/services/results";
import { createCandidate, setCandidateStatus } from "@/lib/services/candidates";
import { verifyAuditChain } from "@/lib/services/audit-read";
import { buildResultReport } from "@/lib/services/report";
import { getElection } from "@/lib/services/elections";
import { query, one } from "@/lib/db";
import * as OTPAuth from "otpauth";
import { asOwner, ctx, makeAdmin, makeElection, makeStudent, resetVolatile, setElectionStatus, teardown } from "./helpers/fixtures";
import { voterTokenHash } from "@/lib/services/voter-auth";
import { castVote } from "@/lib/services/voting";

async function vote(electionId: string, candidateId: string) {
  const s = await makeStudent();
  const tok = `tok-${s.id}`;
  await query(`insert into voter_credentials (token_hash, student_id, election_id, expires_at) values ($1, $2, $3, now() + interval '10 minutes')`, [voterTokenHash(tok), s.id, electionId]);
  return castVote(tok, candidateId);
}

async function closedElectionWithVotes(votes: number[]) {
  const { electionId, candidateIds } = await makeElection({ candidates: votes.length });
  for (let i = 0; i < votes.length; i++) for (let k = 0; k < votes[i]; k++) await vote(electionId, candidateIds[i]);
  await setElectionStatus(electionId, "CLOSED");
  return { electionId, candidateIds };
}

async function sessionFor(admin: Awaited<ReturnType<typeof makeAdmin>>) {
  const { token } = await adminLogin({ email: admin.email, password: admin.password }, ctx());
  return completeMfa(token, admin.totp(), ctx());
}

describe("admin authentication & MFA", () => {
  beforeEach(resetVolatile);
  afterAll(teardown);

  it("password alone does not grant access; MFA completes sign-in and rotates the session token", async () => {
    const a = await makeAdmin("ELECTION_ADMIN");
    const { token } = await adminLogin({ email: a.email, password: a.password }, ctx());
    await expect(requireAdmin(token, "students.read", ctx())).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    const full = await completeMfa(token, a.totp(), ctx());
    expect(full).not.toBe(token);
    expect(await getAdminIdentity(token)).toBeNull();
    await expect(requireAdmin(full, "students.read", ctx())).resolves.toMatchObject({ adminId: a.id });
  });

  it("rejects wrong passwords, locks after repeated failures, and does not reveal unknown accounts", async () => {
    const a = await makeAdmin("AUDITOR");
    for (let i = 0; i < 5; i++) await expect(adminLogin({ email: a.email, password: "wrong-password" }, ctx())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(adminLogin({ email: a.email, password: a.password }, ctx())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(adminLogin({ email: "nobody@committee.test", password: "x" }, ctx())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("an admin bootstrapped from the SQL editor (pgcrypto bcrypt) can sign in and is upgraded to scrypt", async () => {
    const email = `boot-${Date.now()}@committee.test`;
    await asOwner((c) => c.query(
      `insert into election_admins (email, full_name, role_code, password_hash)
       values ($1, 'Bootstrapped Chief', 'SUPER_ADMIN', extensions.crypt('Bootstrap-Pass-2026', extensions.gen_salt('bf', 8)))`, [email]));
    await expect(adminLogin({ email, password: "wrong-Password-1" }, ctx())).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const r = await adminLogin({ email, password: "Bootstrap-Pass-2026" }, ctx());
    expect(r.mfaEnrolled).toBe(false);
    const row = await one<{ password_hash: string }>(`select password_hash from election_admins where email = $1`, [email]);
    expect(row!.password_hash.startsWith("scrypt$")).toBe(true);
    await expect(adminLogin({ email, password: "Bootstrap-Pass-2026" }, ctx())).resolves.toBeTruthy();
  });

  it("rejects TOTP replay of an already-used code", async () => {
    const a = await makeAdmin("AUDITOR");
    const code = a.totp();
    const s1 = await adminLogin({ email: a.email, password: a.password }, ctx());
    await completeMfa(s1.token, code, ctx());
    const s2 = await adminLogin({ email: a.email, password: a.password }, ctx());
    await expect(completeMfa(s2.token, code, ctx())).rejects.toMatchObject({ code: "INVALID_OTP" });
  });

  it("new admins must enrol MFA before gaining any access", async () => {
    const sa = await makeAdmin("SUPER_ADMIN");
    const email = `new-${Date.now()}@committee.test`;
    await createAdmin({ email, fullName: "New Officer", role: "RESULTS_OFFICER", password: "Very-Strong-Pass-1" }, sa.id, null);
    const { token, mfaEnrolled } = await adminLogin({ email, password: "Very-Strong-Pass-1" }, ctx());
    expect(mfaEnrolled).toBe(false);
    await expect(requireAdmin(token, "elections.read", ctx())).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    const enrol = await beginMfaEnrollment(token);
    const t = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(enrol.secret), digits: 6, period: 30 });
    const full = await completeMfa(token, t.generate(), ctx());
    await expect(requireAdmin(full, "elections.read", ctx())).resolves.toBeTruthy();
  });

  it("enforces role permissions and audits denied privileged access", async () => {
    const auditor = await makeAdmin("AUDITOR");
    const ea = await makeAdmin("ELECTION_ADMIN");
    const ro = await makeAdmin("RESULTS_OFFICER");
    const roPub = await makeAdmin("RESULTS_OFFICER", { canPublish: true });
    const aTok = await sessionFor(auditor);
    await expect(requireAdmin(aTok, "students.write", ctx())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireAdmin(aTok, "audit.read", ctx())).resolves.toBeTruthy();
    const eTok = await sessionFor(ea);
    await expect(requireAdmin(eTok, "elections.control", ctx())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireAdmin(eTok, "corrections.review", ctx())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireAdmin(eTok, "corrections.create", ctx())).resolves.toBeTruthy();
    const rTok = await sessionFor(ro);
    await expect(requireAdmin(rTok, "results.publish", ctx())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireAdmin(await sessionFor(roPub), "results.publish", ctx())).resolves.toBeTruthy();
    const denied = await one<{ n: number }>(`select count(*)::int as n from audit_logs where action = 'ADMIN.ACCESS_DENIED' and actor_admin_id = $1`, [auditor.id]);
    expect(denied?.n).toBe(1);
  });
});

describe("election lifecycle", () => {
  afterAll(teardown);

  it("prevents invalid state transitions (service and database)", async () => {
    const sa = await makeAdmin("SUPER_ADMIN");
    await asOwner((c) => c.query(`update elections set status = 'CLOSED' where status in ('SCHEDULED','LIVE','PAUSED')`));
    const id = await createElection({ title: "Lifecycle", opensAt: new Date(Date.now() + 3600e3), closesAt: new Date(Date.now() + 7200e3) }, sa.id, null);
    await expect(transitionElection(id, "open", sa.id, null)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(transitionElection(id, "schedule", sa.id, null)).rejects.toMatchObject({ code: "INVALID_STATE" }); // no candidates
    const s = await makeStudent();
    const cid = await createCandidate(id, { rollNumber: s.roll, displayName: "Alpha" }, sa.id, null);
    await setCandidateStatus(cid, "APPROVED", sa.id, null);
    expect(await transitionElection(id, "schedule", sa.id, null)).toBe("SCHEDULED");
    expect(await transitionElection(id, "open", sa.id, null)).toBe("LIVE");
    await expect(transitionElection(id, "pause", sa.id, null)).rejects.toMatchObject({ code: "VALIDATION" }); // reason required
    expect(await transitionElection(id, "pause", sa.id, null, "Network outage on campus")).toBe("PAUSED");
    expect(await transitionElection(id, "resume", sa.id, null)).toBe("LIVE");
    // Candidate roster is locked once live (DB trigger)
    await expect(setCandidateStatus(cid, "INACTIVE", sa.id, null)).rejects.toMatchObject({ code: "CANDIDATES_LOCKED" });
    // Direct database attempt to jump to RESULTS_PUBLISHED is rejected
    await expect(query(`update elections set status = 'RESULTS_PUBLISHED' where id = $1`, [id])).rejects.toThrow(/INVALID_TRANSITION/);
    expect(await transitionElection(id, "close", sa.id, null, "Voting window complete")).toBe("CLOSED");
    await expect(query(`update elections set status = 'LIVE' where id = $1`, [id])).rejects.toThrow(/INVALID_TRANSITION/);
    const e = await getElection(id);
    expect(e.eligible_snapshot).not.toBeNull();
  });

  it("auto-opens a scheduled election and auto-closes after the closing time", async () => {
    const { electionId } = await makeElection({ status: "SCHEDULED", opensInMin: -1, closesInMin: 60 });
    expect((await getElection(electionId)).status).toBe("LIVE");
    await asOwner(async (c) => {
      await c.query("alter table elections disable trigger trg_election_transition");
      await c.query(`update elections set closes_at = now() - interval '1 second' where id = $1`, [electionId]);
      await c.query("alter table elections enable trigger trg_election_transition");
    });
    expect((await getElection(electionId)).status).toBe("CLOSED");
  });
});

describe("results confidentiality & publication", () => {
  afterAll(teardown);

  it("candidate-wise results and the ballot ledger are sealed while voting is open", async () => {
    const { electionId, candidateIds } = await makeElection();
    await vote(electionId, candidateIds[0]);
    await expect(getResultSummary(electionId)).rejects.toMatchObject({ code: "RESULTS_SEALED" });
    await expect(query(`select * from compute_tally($1)`, [electionId])).rejects.toThrow(/RESULTS_SEALED/);
    await expect(getBallotLedger(electionId)).rejects.toMatchObject({ code: "RESULTS_SEALED" });
    const live = await getElection(electionId);
    expect(await getPublishedResults(live)).toBeNull();
  });

  it("requires verification, rejects unauthorised publishers and publishes an immutable snapshot", async () => {
    const { electionId, candidateIds } = await closedElectionWithVotes([3, 1, 0]);
    const ro = await makeAdmin("RESULTS_OFFICER");
    const roPub = await makeAdmin("RESULTS_OFFICER", { canPublish: true });
    const ea = await makeAdmin("ELECTION_ADMIN");
    await expect(publishResults(electionId, roPub.id, "", null)).rejects.toMatchObject({ code: "INVALID_STATE" }); // not verified
    await expect(verifyResults(electionId, ea.id, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await verifyResults(electionId, ro.id, null);
    await expect(publishResults(electionId, ro.id, "", null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const summary = await getResultSummary(electionId);
    expect(summary.reconciled).toBe(true);
    expect(summary.outcome).toMatchObject({ kind: "WINNER", winner: { candidate_id: candidateIds[0], votes: 3 } });
    await publishResults(electionId, roPub.id, "", null);
    const e = await getElection(electionId);
    expect(e.status).toBe("RESULTS_PUBLISHED");
    const pub = await getPublishedResults(e);
    expect(pub!.rows.map((r) => r.votes)).toEqual([3, 1, 0]);
    expect(pub!.rows[0].is_winner).toBe(true);
    // App role cannot rewrite the snapshot
    await expect(query(`update election_results set vote_count = 99 where election_id = $1`, [electionId])).rejects.toThrow();
    const pdf = await buildResultReport(electionId);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("handles ties explicitly: no winner declared and a committee note is required", async () => {
    const { electionId } = await closedElectionWithVotes([2, 2, 1]);
    const sa = await makeAdmin("SUPER_ADMIN");
    await verifyResults(electionId, sa.id, null);
    const s = await getResultSummary(electionId);
    expect(s.outcome.kind).toBe("TIE");
    await expect(publishResults(electionId, sa.id, "", null)).rejects.toMatchObject({ code: "TIE_NOTE_REQUIRED" });
    await publishResults(electionId, sa.id, "Tie resolved by re-run scheduled per committee rule 7.", null);
    const pub = await getPublishedResults(await getElection(electionId));
    expect(pub!.rows.filter((r) => r.is_winner)).toHaveLength(0);
    expect(pub!.rows.filter((r) => r.is_tied)).toHaveLength(2);
  });
});

describe("correction workflow (two-person rule)", () => {
  afterAll(teardown);

  it("request → second-admin approval → ballot invalidated, original preserved, results reconciled", async () => {
    const { electionId, candidateIds } = await closedElectionWithVotes([2, 1]);
    const ea = await makeAdmin("ELECTION_ADMIN");
    const sa1 = await makeAdmin("SUPER_ADMIN");
    const sa2 = await makeAdmin("SUPER_ADMIN");
    const ledger = await getBallotLedger(electionId);
    const target = ledger.find((b) => b.candidate_name === "Candidate 1")!;
    await expect(createCorrection(electionId, { ballotRef: target.ballot_ref, correction: "INVALIDATE_BALLOT", reason: "short" }, null, ea.id, null)).rejects.toThrow();
    const reqId = await createCorrection(
      electionId,
      { ballotRef: target.ballot_ref, correction: "INVALIDATE_BALLOT", reason: "Ballot recorded during a confirmed identity-misuse incident (dispute D-TEST)." },
      Buffer.from("%PDF-1.4 evidence"),
      ea.id,
      null,
    );
    // Duplicate pending request on the same ballot is refused
    await expect(createCorrection(electionId, { ballotRef: target.ballot_ref, correction: "INVALIDATE_BALLOT", reason: "Second request for the same ballot, duplicate." }, null, sa1.id, null)).rejects.toMatchObject({ code: "CONFLICT" });
    // Requester cannot approve; election admin lacks review permission anyway
    await expect(reviewCorrection(reqId, true, "self approve", ea.id, null)).rejects.toMatchObject({ code: "SECOND_PERSON_REQUIRED" });
    // Verification is blocked while a correction is pending
    await expect(verifyResults(electionId, sa1.id, null)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(await reviewCorrection(reqId, true, "Evidence reviewed by committee; approved.", sa1.id, null)).toBe("APPROVED");
    const after = await getBallotLedger(electionId);
    const b = after.find((x) => x.ballot_id === target.ballot_id)!;
    expect(b.status).toBe("INVALIDATED");
    expect(b.candidate_name).toBe(target.candidate_name); // original selection preserved
    expect(after).toHaveLength(ledger.length); // nothing deleted
    const s = await getResultSummary(electionId);
    expect(s.totals).toMatchObject({ total_ballots: 3, valid_ballots: 2, invalidated_ballots: 1 });
    expect(s.tally.find((t) => t.candidate_id === candidateIds[0])!.votes).toBe(1);
    expect(s.reconciled).toBe(true);
    // Reviewed corrections are immutable
    await expect(reviewCorrection(reqId, false, "change my mind", sa2.id, null)).rejects.toMatchObject({ code: "INVALID_STATE" });
    const trail = await query<{ action: string }>(`select action from audit_logs where entity_id = $1 order by id`, [reqId]);
    expect(trail.map((t) => t.action)).toEqual(["CORRECTION.REQUESTED", "CORRECTION.APPROVED"]);
    const row = await one<{ requested_by: string; reviewed_by: string; reason: string; ballot_status_before: string }>(`select * from correction_requests where id = $1`, [reqId]);
    expect(row).toMatchObject({ requested_by: ea.id, reviewed_by: sa1.id, ballot_status_before: "VALID" });
    // Reinstate via a new request, reviewed by another super admin
    const r2 = await createCorrection(electionId, { ballotRef: target.ballot_ref, correction: "REINSTATE_BALLOT", reason: "Dispute withdrawn after committee hearing; reinstating ballot." }, null, sa1.id, null);
    await expect(reviewCorrection(r2, true, "self", sa1.id, null)).rejects.toMatchObject({ code: "SECOND_PERSON_REQUIRED" });
    expect(await reviewCorrection(r2, false, "Rejected — hearing outcome not final.", sa2.id, null)).toBe("REJECTED");
  });

  it("the application role cannot modify ballots or approve corrections directly", async () => {
    const { electionId } = await closedElectionWithVotes([1]);
    await expect(query(`select * from ballots`)).rejects.toThrow(/permission denied/);
    await expect(query(`update ballots set status = 'INVALIDATED'`)).rejects.toThrow(/permission denied/);
    await expect(query(`delete from ballots`)).rejects.toThrow(/permission denied/);
    await expect(query(`delete from voter_participation where election_id = $1`, [electionId])).rejects.toThrow(/permission denied/);
    const ea = await makeAdmin("ELECTION_ADMIN");
    const [b] = await getBallotLedger(electionId);
    const id = await createCorrection(electionId, { ballotRef: b.ballot_ref, correction: "INVALIDATE_BALLOT", reason: "Testing that direct approval is impossible here." }, null, ea.id, null);
    await expect(query(`update correction_requests set status = 'APPROVED' where id = $1`, [id])).rejects.toThrow();
    await expect(query(`update correction_requests set reviewed_by = $2 where id = $1`, [id, ea.id])).rejects.toThrow(/permission denied/);
    await expect(query(`insert into correction_requests (election_id, ballot_id, correction, reason, status, requested_by) values ($1, $2, 'INVALIDATE_BALLOT', 'forged approval forged approval', 'APPROVED', $3)`, [electionId, b.ballot_id, ea.id])).rejects.toThrow();
    // the requester can withdraw a pending request
    await cancelCorrection(id, ea.id, null);
    // even the database owner cannot silently change a ballot's candidate or delete it
    await asOwner(async (c) => {
      await expect(c.query(`update ballots set candidate_id = candidate_id where election_id = $1`, [electionId])).rejects.toThrow(/IMMUTABLE/);
      await expect(c.query(`delete from ballots where election_id = $1`, [electionId])).rejects.toThrow(/IMMUTABLE/);
      await expect(c.query(`truncate ballots cascade`)).rejects.toThrow(/IMMUTABLE/);
    });
  });
});

describe("audit log integrity", () => {
  afterAll(teardown);

  it("is append-only and hash-chained; tampering is detected", async () => {
    const chain = await verifyAuditChain();
    expect(chain.ok).toBe(true);
    expect(Number(chain.entries)).toBeGreaterThan(5);
    await expect(query(`update audit_logs set action = 'X.HIDDEN' where id = (select max(id) from audit_logs)`)).rejects.toThrow();
    await expect(query(`delete from audit_logs`)).rejects.toThrow();
    // Simulate a privileged attacker bypassing the trigger: the chain check catches it.
    const tamper = (sql: string) => asOwner(async (c) => {
      await c.query("alter table audit_logs disable trigger trg_audit_immutable");
      await c.query(sql);
      await c.query("alter table audit_logs enable trigger trg_audit_immutable");
    });
    const victim = await one<{ id: string; details: unknown }>(`select id::text, details from audit_logs order by id limit 1 offset 1`);
    await tamper(`update audit_logs set details = '{"tampered":true}' where id = ${Number(victim!.id)}`);
    const broken = await verifyAuditChain();
    expect(broken.ok).toBe(false);
    expect(String(broken.first_broken_id)).toBe(victim!.id);
    // restore so later suites (backup verification) see an intact chain
    await tamper(`update audit_logs set details = '${JSON.stringify(victim!.details).replace(/'/g, "''")}'::jsonb where id = ${Number(victim!.id)}`);
    expect((await verifyAuditChain()).ok).toBe(true);
  });

  it("never contains OTP codes, passwords or ballot selections", async () => {
    const rows = await query<{ details: Record<string, unknown> }>(`select details from audit_logs`);
    const blob = JSON.stringify(rows);
    expect(blob).not.toMatch(/"(otp|code|password|candidate_id)"\s*:/i);
  });
});

describe("public database roles (Supabase anon)", () => {
  afterAll(teardown);
  it("anon can read only public data and can never write", async () => {
    await asOwner(async (c) => {
      await c.query("set role anon");
      for (const t of ["students", "ballots", "voter_participation", "audit_logs", "otp_verifications", "election_admins", "admin_sessions", "voter_credentials"]) {
        await expect(c.query(`select * from ${t} limit 1`)).rejects.toThrow(/permission denied/);
      }
      await expect(c.query(`select id, display_name from candidates limit 1`)).resolves.toBeTruthy();
      await expect(c.query(`insert into elections (title, opens_at, closes_at) values ('x', now(), now() + interval '1h')`)).rejects.toThrow(/permission denied/);
      await expect(c.query(`select * from cast_ballot('x', gen_random_uuid())`)).rejects.toThrow(/permission denied/);
      const drafts = await c.query(`select count(*)::int as n from elections where status = 'DRAFT'`);
      expect(drafts.rows[0].n).toBe(0);
      await c.query("reset role");
    });
  });
});
