import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { requestOtp, verifyOtp, getVoterSession, voterTokenHash } from "@/lib/services/voter-auth";
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

const totals = (electionId: string) =>
  one<{ total_ballots: number; participation: number; positions: number }>(`select * from ballot_totals($1)`, [electionId]);

describe("two-vote ballot: one boy + one girl", () => {
  beforeEach(resetVolatile);
  afterAll(teardown);

  it("accepts one boy + one girl, records two anonymous ballots and one participation, and the receipt hides both choices", async () => {
    const e = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    const receipt = await castVote(token, e.ballot(1, 2));
    expect(receipt.receiptCode).toMatch(/^TT28-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(JSON.stringify(receipt)).not.toContain(e.boys[1]);
    expect(JSON.stringify(receipt)).not.toContain(e.girls[2]);
    expect((await getVoterSession(token))?.hasVoted).toBe(true);
    expect(await totals(e.electionId)).toMatchObject({ total_ballots: 2, participation: 1, positions: 2 });
    const per = await query<{ code: string; total_ballots: number }>(`select code, total_ballots from ballot_totals_by_position($1) order by code`, [e.electionId]);
    expect(per).toEqual([{ code: "CR_BOYS", total_ballots: 1 }, { code: "CR_GIRLS", total_ballots: 1 }]);
  });

  it("the order in which the two choices are sent does not matter", async () => {
    const e = await makeElection();
    const token = await login((await makeStudent()).roll);
    await expect(castVote(token, [e.girls[0], e.boys[0]])).resolves.toHaveProperty("receiptCode");
  });

  describe("STRICT RULE: exactly one choice in each race, nothing else is accepted", () => {
    it("rejects a ballot with only one vote (boy only / girl only)", async () => {
      const e = await makeElection();
      const token = await login((await makeStudent()).roll);
      await expect(castVote(token, [e.boys[0]])).rejects.toMatchObject({ code: "INCOMPLETE_BALLOT" });
      await expect(castVote(token, [e.girls[0]])).rejects.toMatchObject({ code: "INCOMPLETE_BALLOT" });
      expect((await getVoterSession(token))?.hasVoted).toBe(false);
      expect(await totals(e.electionId)).toMatchObject({ total_ballots: 0, participation: 0 });
    });

    it("rejects two boys, or two girls (two votes in the same race)", async () => {
      const e = await makeElection();
      const token = await login((await makeStudent()).roll);
      await expect(castVote(token, [e.boys[0], e.boys[1]])).rejects.toMatchObject({ code: "INCOMPLETE_BALLOT" });
      await expect(castVote(token, [e.girls[0], e.girls[1]])).rejects.toMatchObject({ code: "INCOMPLETE_BALLOT" });
      expect(await totals(e.electionId)).toMatchObject({ total_ballots: 0, participation: 0 });
    });

    it("rejects the same candidate sent twice, an empty ballot, and extra votes", async () => {
      const e = await makeElection();
      const token = await login((await makeStudent()).roll);
      await expect(castVote(token, [e.boys[0], e.boys[0]])).rejects.toMatchObject({ code: "INCOMPLETE_BALLOT" });
      await expect(castVote(token, [])).rejects.toMatchObject({ code: "INCOMPLETE_BALLOT" });
      await expect(castVote(token, [e.boys[0], e.girls[0], e.girls[1]])).rejects.toMatchObject({ code: "INCOMPLETE_BALLOT" });
      await expect(castVote(token, [e.boys[0], e.boys[1], e.girls[0], e.girls[1]])).rejects.toMatchObject({ code: "INCOMPLETE_BALLOT" });
      expect(await totals(e.electionId)).toMatchObject({ total_ballots: 0, participation: 0 });
    });

    it("rejects unknown candidates and candidates of another election; a valid pair still works afterwards", async () => {
      // Create the draft first: makeElection() retires any active election, so the live one must come last.
      const other = await makeElection({ status: "DRAFT" });
      const e = await makeElection();
      const token = await login((await makeStudent()).roll);
      const ghost = "00000000-0000-4000-8000-000000000000";
      await expect(castVote(token, [ghost, e.girls[0]])).rejects.toMatchObject({ code: "INVALID_CANDIDATE" });
      await expect(castVote(token, [e.boys[0], ghost])).rejects.toMatchObject({ code: "INVALID_CANDIDATE" });
      await expect(castVote(token, [other.boys[0], other.girls[0]])).rejects.toMatchObject({ code: "INVALID_CANDIDATE" });
      await expect(castVote(token, [e.boys[0], other.girls[0]])).rejects.toMatchObject({ code: "INVALID_CANDIDATE" });
      expect((await getVoterSession(token))?.hasVoted).toBe(false);
      await expect(castVote(token, e.ballot())).resolves.toHaveProperty("receiptCode");
    });

    it("the database refuses a candidate in the wrong race (a girl cannot run for Boys' CR, and vice versa)", async () => {
      const e = await makeElection({ status: "DRAFT", boys: 1, girls: 1 });
      const girl = await makeStudent({ gender: "FEMALE" });
      const boy = await makeStudent({ gender: "MALE" });
      const unset = await makeStudent({ gender: null });
      const ins = (pos: string, st: string) =>
        query(`insert into candidates (election_id, position_id, student_id, display_name, status) values ($1, $2, $3, 'Test Candidate', 'APPROVED')`, [e.electionId, pos, st]);
      await expect(ins(e.boysPositionId, girl.id)).rejects.toThrow(/GENDER_MISMATCH/);
      await expect(ins(e.girlsPositionId, boy.id)).rejects.toThrow(/GENDER_MISMATCH/);
      await expect(ins(e.boysPositionId, unset.id)).rejects.toThrow(/GENDER_MISMATCH/);
      await expect(ins(e.girlsPositionId, girl.id)).resolves.toBeTruthy();
    });

    it("a student's gender cannot be changed while they are a candidate", async () => {
      const e = await makeElection({ status: "DRAFT", boys: 1, girls: 1 });
      const row = await one<{ student_id: string }>(`select student_id from candidates where id = $1`, [e.boys[0]]);
      await expect(query(`update students set gender = 'FEMALE' where id = $1`, [row!.student_id])).rejects.toThrow(/GENDER_MISMATCH/);
    });

    it("an election cannot be scheduled unless BOTH races have an approved candidate", async () => {
      const e = await makeElection({ status: "DRAFT", boys: 1, girls: 1 });
      await query(`update candidates set status = 'INACTIVE' where id = $1`, [e.girls[0]]);
      await expect(query(`update elections set status = 'SCHEDULED' where id = $1`, [e.electionId])).rejects.toThrow(/every position/);
      await query(`update candidates set status = 'APPROVED' where id = $1`, [e.girls[0]]);
      await expect(query(`update elections set status = 'SCHEDULED' where id = $1`, [e.electionId])).resolves.toBeTruthy();
    });
  });

  it("rejects a second ballot, also from a brand-new session", async () => {
    const e = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    await castVote(token, e.ballot(0, 0));
    await expect(castVote(token, e.ballot(1, 1))).rejects.toMatchObject({ code: "ALREADY_VOTED" });
    const token2 = await login(s.roll);
    await expect(castVote(token2, e.ballot(2, 2))).rejects.toMatchObject({ code: "ALREADY_VOTED" });
    expect(await totals(e.electionId)).toMatchObject({ total_ballots: 2, participation: 1 });
  });

  it("accepts exactly one ballot (2 ballot rows) under 25 concurrent duplicate submissions", async () => {
    const e = await makeElection();
    const token = await login((await makeStudent()).roll);
    const results = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => castVote(token, e.ballot(i % 3, (i + 1) % 3))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && (r.reason as { code: string }).code === "ALREADY_VOTED")).toHaveLength(24);
    expect(await totals(e.electionId)).toMatchObject({ total_ballots: 2, participation: 1 });
  });

  it("rejects votes while paused, after closing, and before opening", async () => {
    const e = await makeElection();
    const token = await login((await makeStudent()).roll);
    await setElectionStatus(e.electionId, "PAUSED");
    await expect(castVote(token, e.ballot())).rejects.toMatchObject({ code: "ELECTION_PAUSED" });
    await setElectionStatus(e.electionId, "LIVE");
    await asOwner(async (c) => {
      await c.query("alter table elections disable trigger trg_election_transition");
      await c.query(`update elections set closes_at = now() - interval '1 second' where id = $1`, [e.electionId]);
      await c.query("alter table elections enable trigger trg_election_transition");
    });
    await expect(castVote(token, e.ballot())).rejects.toMatchObject({ code: "ELECTION_CLOSED" });

    const e2 = await makeElection({ status: "SCHEDULED", opensInMin: 30, closesInMin: 60 });
    const s2 = await makeStudent();
    await query(`insert into voter_credentials (token_hash, student_id, election_id, expires_at) values ($1, $2, $3, now() + interval '10 minutes')`, [voterTokenHash("early-bird-token"), s2.id, e2.electionId]);
    await expect(castVote("early-bird-token", e2.ballot())).rejects.toMatchObject({ code: "ELECTION_NOT_OPEN" });
  });

  it("rejects votes with an expired, revoked or missing session", async () => {
    const e = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    await asOwner((c) => c.query(`update voter_credentials set created_at = now() - interval '1 hour', expires_at = now() - interval '1 second' where student_id = $1`, [s.id]));
    await expect(castVote(token, e.ballot())).rejects.toMatchObject({ code: "SESSION_INVALID" });
    await expect(castVote(null, e.ballot())).rejects.toMatchObject({ code: "SESSION_INVALID" });
  });

  it("a student deactivated mid-session cannot vote", async () => {
    const e = await makeElection();
    const s = await makeStudent();
    const token = await login(s.roll);
    await query(`update students set is_active = false where id = $1`, [s.id]);
    await expect(castVote(token, e.ballot())).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("network interruption: a retried submission after a committed vote is 'already voted' and the receipt is recoverable", async () => {
    const e = await makeElection();
    const token = await login((await makeStudent()).roll);
    const first = await castVote(token, e.ballot()); // response "lost" in transit
    await expect(castVote(token, e.ballot())).rejects.toMatchObject({ code: "ALREADY_VOTED" });
    expect((await getVoterSession(token))?.receiptCode).toBe(first.receiptCode);
  });

  it("a transaction aborted mid-way leaves NO partial records (neither participation nor either ballot)", async () => {
    const e = await makeElection();
    const token = await login((await makeStudent()).roll);
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    await c.query("begin");
    await c.query("select * from cast_ballot($1, $2::uuid[])", [voterTokenHash(token), e.ballot()]);
    await c.query("rollback"); // simulated connection drop before commit
    await c.end();
    expect(await totals(e.electionId)).toMatchObject({ total_ballots: 0, participation: 0 });
    await expect(castVote(token, e.ballot())).resolves.toHaveProperty("receiptCode");
  });

  it("the application role cannot insert ballots directly (only cast_ballot can)", async () => {
    const e = await makeElection();
    await expect(query(`insert into ballots (election_id, position_id, candidate_id, ballot_ref) values ($1, $2, $3, 'B-0123456789ABCDEF')`, [e.electionId, e.boysPositionId, e.boys[0]])).rejects.toThrow(/permission denied/);
  });

  it("load: 150 voters voting simultaneously (with duplicate retries) → one participation and exactly 2 ballots each, one per race", async () => {
    const e = await makeElection({ boys: 4, girls: 3 });
    const voters = await Promise.all(Array.from({ length: 150 }, () => makeStudent()));
    const tokens: string[] = [];
    for (const v of voters) tokens.push(await login(v.roll));
    const attempts = tokens.flatMap((t, i) => [castVote(t, e.ballot(i % 4, i % 3)), castVote(t, e.ballot((i + 1) % 4, (i + 2) % 3))]);
    const results = await Promise.allSettled(attempts);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(150);
    expect(new Set(results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason.code))).toEqual(new Set(["ALREADY_VOTED"]));
    expect(await totals(e.electionId)).toMatchObject({ total_ballots: 300, participation: 150 });
    const per = await query<{ total_ballots: number }>(`select total_ballots from ballot_totals_by_position($1)`, [e.electionId]);
    expect(per.map((p) => p.total_ballots)).toEqual([150, 150]);
    const perVoter = await one<{ max: number }>(`select max(n)::int as max from (select count(*) n from voter_participation where election_id = $1 group by student_id) x`, [e.electionId]);
    expect(perVoter?.max).toBe(1);
  }, 120_000);
});
