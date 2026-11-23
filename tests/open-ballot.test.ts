import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { changeVote, listVoteRecords, voteChangedAt } from "@/lib/services/vote-records";
import { castVote } from "@/lib/services/voting";
import { getVoterSession, requestOtp, verifyOtp } from "@/lib/services/voter-auth";
import { devOutbox } from "@/lib/otp/provider";
import { query } from "@/lib/db";
import { asOwner, ctx, makeAdmin, makeElection, makeStudent, resetVolatile, setElectionStatus, teardown } from "./helpers/fixtures";

async function login(roll: string, ip: string) {
  const r = await requestOtp(roll, ctx(ip));
  await r.deliver();
  const { token } = await verifyOtp(r.challengeId, devOutbox()[0].code, ctx(ip));
  return token;
}
async function voteAs(e: Awaited<ReturnType<typeof makeElection>>, i = 0, j = 0, ip = "203.0.113.50") {
  const s = await makeStudent();
  const token = await login(s.roll, ip);
  await castVote(token, e.ballot(i, j));
  return { s, token };
}

describe("open ballot: votes stored with the voter, visible/changeable only by a Super Admin", () => {
  beforeEach(resetVolatile);
  afterAll(teardown);

  it("every new vote is stored with the voter; the Super Admin sees who voted for whom", async () => {
    const e = await makeElection();
    const sup = await makeAdmin("SUPER_ADMIN");
    const { s } = await voteAs(e, 1, 2);
    const rows = await listVoteRecords(sup.id, e.electionId, "h");
    const mine = rows.find((r) => r.studentId === s.id)!;
    expect(mine.anonymous).toBe(false);
    expect(mine.choices.map((c) => c.candidateName).sort()).toEqual(["Boy 2", "Girl 3"]);
    const audit = await query<{ action: string }>(`select action from audit_logs where action = 'VOTES.VIEWED'`);
    expect(audit.length).toBeGreaterThan(0);
  });

  it("nobody else can: other admin roles are refused, and the application role cannot read the table", async () => {
    const e = await makeElection();
    await voteAs(e);
    for (const role of ["ELECTION_ADMIN", "RESULTS_OFFICER", "AUDITOR"] as const) {
      const a = await makeAdmin(role);
      await expect(listVoteRecords(a.id, e.electionId, "h")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(query(`select * from voter_choices`)).rejects.toThrow(/permission denied/);
    await expect(query(`select * from ballots`)).rejects.toThrow(/permission denied/);
  });

  it("a Super Admin changes a vote: ballots and the record change, the original is kept, the voter is told, the audit log omits the candidates", async () => {
    const e = await makeElection();
    const sup = await makeAdmin("SUPER_ADMIN");
    const { s } = await voteAs(e, 0, 0);
    const boyPos = e.boysPositionId;
    expect(await voteChangedAt(s.id, e.electionId)).toBeNull();
    await changeVote(sup.id, { electionId: e.electionId, studentId: s.id, positionId: boyPos, candidateId: e.boys[2], reason: "Voter reported a mistake" }, "h");
    const mine = (await listVoteRecords(sup.id, e.electionId, "h")).find((r) => r.studentId === s.id)!;
    const boy = mine.choices.find((c) => c.positionId === boyPos)!;
    expect(boy.candidateName).toBe("Boy 3");
    expect(boy.originalName).toBe("Boy 1");
    expect(boy.reason).toBe("Voter reported a mistake");
    expect(await voteChangedAt(s.id, e.electionId)).toBeInstanceOf(Date);
    // the anonymous ballot row itself moved, so the tally follows
    const moved = await asOwner(async (c) => (await c.query(`select count(*)::int n from ballots where election_id = $1 and candidate_id = $2`, [e.electionId, e.boys[2]])).rows[0].n);
    expect(moved).toBe(1);
    const log = await query<{ details: Record<string, unknown> }>(`select details from audit_logs where action = 'VOTE.CHANGED_BY_ADMIN'`);
    expect(log.length).toBe(1);
    expect(JSON.stringify(log[0].details)).not.toMatch(/Boy |Girl /);
    expect(log[0].details.reason).toBe("Voter reported a mistake");
  });

  it("rules: reason required, same-race candidate only, right gender, not the same candidate, not after closing, Super Admin only", async () => {
    const e = await makeElection();
    const sup = await makeAdmin("SUPER_ADMIN");
    const normal = await makeAdmin("ELECTION_ADMIN");
    const { s } = await voteAs(e, 0, 0);
    const base = { electionId: e.electionId, studentId: s.id, positionId: e.boysPositionId, candidateId: e.boys[1], reason: "Correcting a verified mistake" };
    await expect(changeVote(normal.id, base, "h")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(changeVote(sup.id, { ...base, reason: "x" }, "h")).rejects.toBeTruthy();
    await expect(changeVote(sup.id, { ...base, candidateId: e.girls[0] }, "h")).rejects.toMatchObject({ code: "INVALID_CANDIDATE" }); // a girl in the boys' race
    await expect(changeVote(sup.id, { ...base, candidateId: e.boys[0] }, "h")).rejects.toMatchObject({ code: "INVALID_STATE" }); // same candidate
    await changeVote(sup.id, base, "h");
    await setElectionStatus(e.electionId, "CLOSED");
    await expect(changeVote(sup.id, { ...base, candidateId: e.boys[2] }, "h")).rejects.toMatchObject({ code: "ELECTION_LOCKED" });
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
    const mine = (await listVoteRecords(sup.id, e.electionId, "h")).find((r) => r.studentId === s.id)!;
    expect(mine.anonymous).toBe(true);
    expect(mine.choices).toEqual([]);
    await expect(changeVote(sup.id, { electionId: e.electionId, studentId: s.id, positionId: e.boysPositionId, candidateId: e.boys[1], reason: "Trying to edit" }, "h")).rejects.toMatchObject({ code: "INVALID_STATE" });
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
