import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listVoteRecords, requestChoiceChange, voteChangedAt } from "@/lib/services/vote-records";
import { createCorrection, reviewCorrection, listCorrections, correctionSubjects } from "@/lib/services/corrections";
import { auditExport, correctionsExport, participationCsv } from "@/lib/services/records-export";
import { getAdminIdentity, requireStepUp, stepUpMfa } from "@/lib/services/admin-auth";
import { getResultSummary, verifyResults } from "@/lib/services/results";
import { castVote } from "@/lib/services/voting";
import { getVoterSession, requestOtp, verifyOtp } from "@/lib/services/voter-auth";
import { devOutbox } from "@/lib/otp/provider";
import { query } from "@/lib/db";
import { asOwner, ctx, makeAdmin, makeElection, makeStudent, resetVolatile, sessionFor, setElectionStatus, teardown } from "./helpers/fixtures";

async function login(roll: string, ip: string) {
  const r = await requestOtp(roll, ctx(ip));
  await r.deliver();
  const { token } = await verifyOtp(r.challengeId, devOutbox()[0].code, ctx(ip));
  return token;
}
async function voteAs(e: Awaited<ReturnType<typeof makeElection>>, i = 0, j = 0, ip = "203.0.113.50") {
  devOutbox().splice(0);
  const s = await makeStudent();
  const token = await login(s.roll, ip);
  await castVote(token, e.ballot(i, j));
  return { s, token };
}
const ballots = (electionId: string) =>
  asOwner(async (c) => (await c.query(
    `select b.ballot_ref, b.candidate_id, b.status::text, b.replaces_ballot_id, b.created_by_correction_id, b.position_id
       from ballots b where b.election_id = $1`, [electionId])).rows as { ballot_ref: string; candidate_id: string; status: string; replaces_ballot_id: string | null; created_by_correction_id: string | null; position_id: string }[]);

describe("open ballot: votes stored with the voter, visible only to a Super Admin with a fresh code", () => {
  beforeEach(resetVolatile);
  afterAll(teardown);

  it("a Super Admin with a fresh authenticator code sees who voted for whom, and the view is audited", async () => {
    const e = await makeElection();
    const sup = await makeAdmin("SUPER_ADMIN");
    const { s } = await voteAs(e, 1, 2);
    const rows = await listVoteRecords((await sessionFor(sup.id)).hash, e.electionId, "h");
    const mine = rows.find((r) => r.studentId === s.id)!;
    expect(mine.anonymous).toBe(false);
    expect(mine.choices.map((c) => c.candidateName).sort()).toEqual(["Boy 2", "Girl 3"]);
    expect(mine.choices.every((c) => c.originalName === c.candidateName && c.status === "VALID" && c.corrections === 0)).toBe(true);
    const audit = await query<{ actor_admin_id: string }>(`select actor_admin_id from audit_logs where action = 'VOTES.VIEWED' order by id desc limit 1`);
    expect(audit[0].actor_admin_id).toBe(sup.id);
  });

  it("refused without a fresh code, with a stale or revoked session, for every other role, and for the application role", async () => {
    const e = await makeElection();
    await voteAs(e);
    const sup = await makeAdmin("SUPER_ADMIN");
    await expect(listVoteRecords((await sessionFor(sup.id, { stepUp: false })).hash, e.electionId, "h")).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
    const old = await sessionFor(sup.id);
    await query(`update admin_sessions set mfa_stepup_at = now() - interval '11 minutes' where token_hash = $1`, [old.hash]);
    await expect(listVoteRecords(old.hash, e.electionId, "h")).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
    const revoked = await sessionFor(sup.id);
    await query(`update admin_sessions set revoked_at = now() where token_hash = $1`, [revoked.hash]);
    await expect(listVoteRecords(revoked.hash, e.electionId, "h")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(listVoteRecords("not-a-session", e.electionId, "h")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    for (const role of ["ELECTION_ADMIN", "RESULTS_OFFICER", "AUDITOR"] as const) {
      const a = await makeAdmin(role);
      await expect(listVoteRecords((await sessionFor(a.id)).hash, e.electionId, "h")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(query(`select * from voter_choices`)).rejects.toThrow(/permission denied/);
    await expect(query(`select * from ballots`)).rejects.toThrow(/permission denied/);
  });

  it("no silent modification: the one-person vote edit is gone, and ballots / voter records cannot be edited or deleted even by the owner", async () => {
    const e = await makeElection();
    const { s } = await voteAs(e);
    await expect(query(`select admin_change_vote($1, $2, $3, $4, $5, $6, $7)`, [s.id, e.electionId, s.id, e.boysPositionId, e.boys[1], "x", "h"])).rejects.toThrow(/does not exist/);
    await asOwner(async (c) => {
      await expect(c.query(`update ballots set candidate_id = $2 where election_id = $1 and position_id = $3`, [e.electionId, e.boys[1], e.boysPositionId])).rejects.toThrow(/IMMUTABLE/);
      await expect(c.query(`update ballots set status = 'INVALIDATED' where election_id = $1`, [e.electionId])).rejects.toThrow(/IMMUTABLE/);
      await expect(c.query(`delete from ballots where election_id = $1`, [e.electionId])).rejects.toThrow(/IMMUTABLE/);
      await expect(c.query(`update voter_choices set candidate_id = $2 where student_id = $1`, [s.id, e.boys[1]])).rejects.toThrow(/IMMUTABLE/);
      await expect(c.query(`delete from voter_choices where student_id = $1`, [s.id])).rejects.toThrow(/IMMUTABLE/);
      // a forged "replacement" ballot without an approved correction is refused
      const orig = (await c.query(`select id from ballots where election_id = $1 limit 1`, [e.electionId])).rows[0].id;
      await expect(c.query(
        `insert into ballots (election_id, position_id, candidate_id, ballot_ref, replaces_ballot_id, created_by_correction_id)
         values ($1, $2, $3, 'B-00000000000000AA', $4, gen_random_uuid())`, [e.electionId, e.boysPositionId, e.boys[1], orig])).rejects.toThrow();
    });
  });

  it("vote change = two-person correction: requested with a reason after closing, approved by a second Super Admin; the original ballot is kept", async () => {
    const e = await makeElection();
    const sa1 = await makeAdmin("SUPER_ADMIN");
    const sa2 = await makeAdmin("SUPER_ADMIN");
    const ea = await makeAdmin("ELECTION_ADMIN");
    const { s } = await voteAs(e, 0, 0);
    await voteAs(e, 1, 1, "203.0.113.51");
    const s1 = (await sessionFor(sa1.id)).hash;
    const req = { electionId: e.electionId, studentId: s.id, positionId: e.boysPositionId, candidateId: e.boys[2], reason: "Voter showed the committee a verified mistake on the ballot." };

    // not while voting is open
    await expect(requestChoiceChange(s1, req, "h")).rejects.toMatchObject({ code: "ELECTION_LOCKED" });
    await setElectionStatus(e.electionId, "CLOSED");
    // reason is mandatory; Election Admins cannot request it (they cannot see whose ballot is whose)
    await expect(requestChoiceChange(s1, { ...req, reason: "too short" }, "h")).rejects.toBeTruthy();
    await expect(requestChoiceChange((await sessionFor(ea.id)).hash, req, "h")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requestChoiceChange(s1, { ...req, candidateId: e.girls[0] }, "h")).rejects.toMatchObject({ code: "INVALID_CANDIDATE" });
    await expect(requestChoiceChange(s1, { ...req, candidateId: e.boys[0] }, "h")).rejects.toMatchObject({ code: "INVALID_STATE" });

    const before = await ballots(e.electionId);
    const id = await requestChoiceChange(s1, req, "h");
    await expect(requestChoiceChange(s1, { ...req, candidateId: e.boys[1] }, "h")).rejects.toMatchObject({ code: "CONFLICT" });
    // requesting changes nothing
    expect(await ballots(e.electionId)).toEqual(before);
    expect(await voteChangedAt(s.id, e.electionId)).toBeNull();

    // the requester cannot approve; an Election Admin cannot; a second Super Admin can
    await expect(reviewCorrection(id, true, "self approval", sa1.id, null)).rejects.toMatchObject({ code: "SECOND_PERSON_REQUIRED" });
    await expect(reviewCorrection(id, true, "not allowed", ea.id, null)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const pending = (await listVoteRecords(s1, e.electionId, "h")).find((v) => v.studentId === s.id)!.choices.find((c) => c.positionId === e.boysPositionId)!;
    expect(pending.pending).toMatchObject({ id, correction: "REPLACE_CHOICE", candidateName: "Boy 3" });
    expect(await reviewCorrection(id, true, "Evidence checked by the committee.", sa2.id, null)).toBe("APPROVED");

    // original kept (same candidate, invalidated), exactly one linked replacement added, nothing deleted
    const after = await ballots(e.electionId);
    expect(after.length).toBe(before.length + 1);
    const orig = after.find((b) => b.ballot_ref === pending.ballotRef)!;
    expect(orig).toMatchObject({ candidate_id: e.boys[0], status: "INVALIDATED" });
    const repl = after.filter((b) => b.created_by_correction_id === id);
    expect(repl).toHaveLength(1);
    expect(repl[0]).toMatchObject({ candidate_id: e.boys[2], status: "VALID", position_id: e.boysPositionId });

    // the Super Admin view shows original and current; the voter is told on their receipt
    const mine = (await listVoteRecords(s1, e.electionId, "h")).find((v) => v.studentId === s.id)!.choices.find((c) => c.positionId === e.boysPositionId)!;
    expect(mine).toMatchObject({ originalName: "Boy 1", candidateName: "Boy 3", status: "VALID", corrections: 1, pending: null });
    expect(mine.ballotRef).toBe(repl[0].ballot_ref);
    expect(await voteChangedAt(s.id, e.electionId)).toBeInstanceOf(Date);

    // reconciliation still exact: one cast ballot per voter per race, replacements counted separately
    const sum = await getResultSummary(e.electionId);
    expect(sum.reconciled).toBe(true);
    expect(sum.totals).toMatchObject({ total_ballots: 4, participation: 2, replacement_ballots: 1, valid_ballots: 4, invalidated_ballots: 1 });
    const boys = sum.positions.find((p) => p.position.id === e.boysPositionId)!.tally;
    expect(boys.find((t) => t.display_name === "Boy 1")!.votes).toBe(0);
    expect(boys.find((t) => t.display_name === "Boy 3")!.votes).toBe(1);
    await verifyResults(e.electionId, sa2.id, null);

    // the superseded original cannot be reinstated (that would count the voter twice)
    await expect(createCorrection(e.electionId, { ballotRef: pending.ballotRef, correction: "REINSTATE_BALLOT", reason: "Trying to reinstate a replaced original ballot." }, null, ea.id, null)).rejects.toMatchObject({ code: "INVALID_STATE" });
    // a further change works on the replacement (the head of the chain)
    const id2 = await requestChoiceChange(s1, { ...req, candidateId: e.boys[1], reason: "Second verified correction after another committee review." }, "h");
    expect(await reviewCorrection(id2, false, "Rejected after review.", sa2.id, null)).toBe("REJECTED");

    // the audit log names the anonymous ballot and candidates, never the voter
    const log = await query<{ action: string; details: Record<string, unknown> }>(
      `select action, details from audit_logs where entity_type = 'correction_request' and entity_id = $1 order by id`, [id]);
    expect(log.map((l) => l.action)).toEqual(["CORRECTION.REQUESTED", "CORRECTION.APPROVED"]);
    expect(log[1].details).toMatchObject({ from_candidate: "Boy 1", to_candidate: "Boy 3", replacement_ballot_ref: repl[0].ballot_ref });
    expect(JSON.stringify(log)).not.toContain(s.roll);

    // the corrections list (all roles with corrections.read) has no voter; only Super Admins can map it to one
    const list = await listCorrections(e.electionId);
    expect(list.find((c) => c.id === id)).toMatchObject({ correction: "REPLACE_CHOICE", from_candidate: "Boy 1", to_candidate: "Boy 3", replacement_ref: repl[0].ballot_ref });
    expect(JSON.stringify(list)).not.toContain(s.roll);
    expect((await correctionSubjects(s1, e.electionId))?.get(id)).toMatchObject({ roll: s.roll });
    expect(await correctionSubjects((await sessionFor(ea.id)).hash, e.electionId)).toBeNull();
  });

  it("votes cast before the notice stay anonymous: listed without a candidate and impossible to change", async () => {
    const e = await makeElection();
    const sup = await makeAdmin("SUPER_ADMIN");
    const { s } = await voteAs(e, 0, 0);
    // simulate a pre-notice vote: remove the link (as owner) for this voter
    await asOwner(async (c) => {
      await c.query(`alter table voter_choices disable trigger trg_voter_choices_no_delete`);
      await c.query(`delete from voter_choices where student_id = $1`, [s.id]);
      await c.query(`alter table voter_choices enable trigger trg_voter_choices_no_delete`);
    });
    const h = (await sessionFor(sup.id)).hash;
    const mine = (await listVoteRecords(h, e.electionId, "h")).find((r) => r.studentId === s.id)!;
    expect(mine.anonymous).toBe(true);
    expect(mine.choices).toEqual([]);
    await setElectionStatus(e.electionId, "CLOSED");
    await expect(requestChoiceChange(h, { electionId: e.electionId, studentId: s.id, positionId: e.boysPositionId, candidateId: e.boys[1], reason: "Trying to edit an anonymous vote here." }, "h")).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("double voting is still impossible and the voter record is written atomically with the ballots", async () => {
    const e = await makeElection();
    const { s, token } = await voteAs(e, 0, 0);
    await expect(castVote(token, e.ballot(1, 1))).rejects.toMatchObject({ code: "ALREADY_VOTED" });
    const n = await asOwner(async (c) => (await c.query(`select (select count(*)::int from ballots where election_id=$1) b, (select count(*)::int from voter_choices where election_id=$1) v`, [e.electionId])).rows[0]);
    expect(n).toEqual({ b: 2, v: 2 });
    expect((await getVoterSession(token))?.studentId).toBe(s.id);
  });
});

describe("step-up MFA", () => {
  beforeEach(resetVolatile);

  it("a correct, unused authenticator code refreshes the session for sensitive actions; wrong or replayed codes do not", async () => {
    const sup = await makeAdmin("SUPER_ADMIN");
    const { token } = await sessionFor(sup.id, { stepUp: false });
    const id = (await getAdminIdentity(token))!;
    await expect(requireStepUp(id)).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
    await expect(stepUpMfa(id, "000000", ctx())).rejects.toMatchObject({ code: "INVALID_OTP" });
    const code = sup.totp();
    await stepUpMfa(id, code, ctx());
    await requireStepUp(id);
    await expect(stepUpMfa(id, code, ctx())).rejects.toMatchObject({ code: "INVALID_OTP" }); // replay
    const actions = (await query<{ action: string }>(`select action from audit_logs where actor_admin_id = $1 order by id`, [sup.id])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["ADMIN.STEP_UP", "ADMIN.STEP_UP_FAILED"]));
  });
});

describe("authorised record exports", () => {
  beforeEach(resetVolatile);

  it("participation export lists who voted, never what they chose", async () => {
    const e = await makeElection();
    const ea = await makeAdmin("ELECTION_ADMIN");
    const { s } = await voteAs(e, 0, 0);
    const csv = await participationCsv(e.electionId, ea.id, "h");
    expect(csv.split("\r\n")[0]).toBe("roll_number,full_name,eligible,active,voted,voted_at_utc");
    expect(csv).toMatch(new RegExp(`${s.roll},[^\\r\\n]*,true,true,yes,\\d{4}-`));
    expect(csv).not.toMatch(/Boy |Girl /);
    expect((await query(`select 1 from audit_logs where action = 'EXPORT.PARTICIPATION' and actor_admin_id = $1`, [ea.id])).length).toBe(1);
  });

  it("the audit and corrections exports verify offline, and any tampering is detected", async () => {
    const e = await makeElection();
    const sa1 = await makeAdmin("SUPER_ADMIN");
    const sa2 = await makeAdmin("SUPER_ADMIN");
    const { s } = await voteAs(e, 0, 0);
    await setElectionStatus(e.electionId, "CLOSED");
    const id = await requestChoiceChange((await sessionFor(sa1.id)).hash, { electionId: e.electionId, studentId: s.id, positionId: e.girlsPositionId, candidateId: e.girls[1], reason: "Verified mistake reported to the committee in writing." }, "h");
    await reviewCorrection(id, true, "Approved after review.", sa2.id, null);

    const corrections = await correctionsExport(e.electionId, sa1.id, "h");
    const audit = await auditExport(sa1.id, "h");
    expect(audit.entries.at(-1)!.action).toBe("EXPORT.AUDIT_LOG");
    expect(JSON.stringify(corrections)).not.toContain(s.roll);

    const dir = mkdtempSync(path.join(tmpdir(), "tt-verify-"));
    const a = path.join(dir, "audit.json"), c = path.join(dir, "corrections.json");
    writeFileSync(a, JSON.stringify(audit));
    writeFileSync(c, JSON.stringify(corrections));
    const run = (...files: string[]) => {
      try {
        return { code: 0, out: execFileSync(process.execPath, ["scripts/verify-records.mjs", ...files], { encoding: "utf8" }) };
      } catch (err) {
        const x = err as { status: number; stdout: string };
        return { code: x.status, out: x.stdout };
      }
    };
    const okRun = run(a, c, "--head", corrections.audit_head!.entry_hash);
    expect(okRun.out).toContain("all checks passed");
    expect(okRun.code).toBe(0);

    // edit one audit entry's details → the chain breaks at that entry
    const tampered = structuredClone(audit);
    const victim = tampered.entries.find((x) => x.action === "CORRECTION.APPROVED" && x.entity_id === id)!;
    victim.details = victim.details.replace("Approved after review.", "Approved by someone else.");
    writeFileSync(a, JSON.stringify(tampered));
    const bad = run(a);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain(`entry #${victim.id}`);

    // a corrections record claiming the original ballot was overwritten is caught
    writeFileSync(a, JSON.stringify(audit));
    const forged = structuredClone(corrections);
    const orig = forged.ledger.find((b) => b.ballot_ref === forged.corrections[0].ballot_ref)!;
    orig.status = "VALID";
    writeFileSync(c, JSON.stringify(forged));
    expect(run(a, c).code).toBe(1);
    // an unknown head hash is reported
    expect(run(a, "--head", "f".repeat(64)).code).toBe(1);
  });
});
