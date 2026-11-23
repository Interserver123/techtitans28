import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAccessLink, listAccessLinks, redeemAccessLink, revokeAccessLink } from "@/lib/services/access-links";
import { getVoterSession } from "@/lib/services/voter-auth";
import { castVote } from "@/lib/services/voting";
import { one } from "@/lib/db";
import { asOwner, ctx, makeAdmin, makeElection, makeStudent, resetVolatile, setElectionStatus, teardown } from "./helpers/fixtures";

const tokenOf = (url: string) => url.split("/vote/link/")[1];

describe("personal voting links", () => {
  beforeEach(resetVolatile);
  afterAll(teardown);

  it("link + roll number signs the student in; the link itself is stored only as a hash", async () => {
    await makeElection();
    const admin = await makeAdmin("ELECTION_ADMIN");
    const s = await makeStudent();
    const { url, id } = await createAccessLink(s.id, { hours: 2, reason: "" }, admin.id, "h");
    const row = await one<{ token_hash: string }>(`select token_hash from voter_access_links where id = $1`, [id]);
    expect(row!.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.token_hash).not.toContain(tokenOf(url));
    const { token } = await redeemAccessLink(tokenOf(url), s.roll, ctx());
    expect((await getVoterSession(token))?.studentId).toBe(s.id);
    expect((await listAccessLinks(s.id))[0].first_used_at).not.toBeNull();
  });

  it("wrong roll number, unknown token, expired and revoked links are all refused", async () => {
    await makeElection();
    const admin = await makeAdmin("ELECTION_ADMIN");
    const s = await makeStudent();
    const other = await makeStudent();
    const { url, id } = await createAccessLink(s.id, { hours: 2, reason: "" }, admin.id, "h");
    await expect(redeemAccessLink(tokenOf(url), other.roll, ctx())).rejects.toMatchObject({ code: "INVALID_LINK" });
    await expect(redeemAccessLink("x".repeat(43), s.roll, ctx())).rejects.toMatchObject({ code: "INVALID_LINK" });
    await asOwner((c) => c.query(`update voter_access_links set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours' where id = $1`, [id]));
    await expect(redeemAccessLink(tokenOf(url), s.roll, ctx())).rejects.toMatchObject({ code: "INVALID_LINK" });
    const fresh = await createAccessLink(s.id, { hours: 2, reason: "" }, admin.id, "h");
    const live = await one<{ id: string }>(`select id from voter_access_links where token_hash is not null and student_id = $1 and revoked_at is null`, [s.id]);
    await revokeAccessLink(live!.id, admin.id, "h");
    await expect(redeemAccessLink(tokenOf(fresh.url), s.roll, ctx())).rejects.toMatchObject({ code: "INVALID_LINK" });
  });

  it("issuing a new link cancels the previous one (one live link per student)", async () => {
    await makeElection();
    const admin = await makeAdmin("ELECTION_ADMIN");
    const s = await makeStudent();
    const a = await createAccessLink(s.id, { hours: 2, reason: "" }, admin.id, "h");
    const b = await createAccessLink(s.id, { hours: 2, reason: "" }, admin.id, "h");
    await expect(redeemAccessLink(tokenOf(a.url), s.roll, ctx())).rejects.toMatchObject({ code: "INVALID_LINK" });
    await expect(redeemAccessLink(tokenOf(b.url), s.roll, ctx("203.0.113.77"))).resolves.toBeTruthy();
  });

  it("guessing roll numbers against one link is rate-limited", async () => {
    await makeElection();
    const admin = await makeAdmin("ELECTION_ADMIN");
    const s = await makeStudent();
    const { url } = await createAccessLink(s.id, { hours: 2, reason: "" }, admin.id, "h");
    for (let i = 0; i < 6; i++) await expect(redeemAccessLink(tokenOf(url), `WRONG${i}A`, ctx())).rejects.toMatchObject({ code: "INVALID_LINK" });
    await expect(redeemAccessLink(tokenOf(url), s.roll, ctx())).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("does not bypass the one-ballot rule or the voting window", async () => {
    const e = await makeElection();
    const admin = await makeAdmin("ELECTION_ADMIN");
    const s = await makeStudent();
    const { url } = await createAccessLink(s.id, { hours: 2, reason: "" }, admin.id, "h");
    const { token } = await redeemAccessLink(tokenOf(url), s.roll, ctx());
    await castVote(token, e.ballot(0, 0));
    // already voted: no new link, and the old one can no longer vote twice
    await expect(createAccessLink(s.id, { hours: 2, reason: "" }, admin.id, "h")).rejects.toMatchObject({ code: "ALREADY_VOTED" });
    const again = await redeemAccessLink(tokenOf(url), s.roll, ctx("203.0.113.88"));
    await expect(castVote(again.token, e.ballot(1, 1))).rejects.toMatchObject({ code: "ALREADY_VOTED" });
    const n = await asOwner(async (c) => (await c.query(`select count(*)::int n from ballots where election_id = $1`, [e.electionId])).rows[0].n);
    expect(n).toBe(2);
    // closed election: no links, no redemption
    const t = await makeStudent();
    await setElectionStatus(e.electionId, "CLOSED");
    await expect(createAccessLink(t.id, { hours: 2, reason: "" }, admin.id, "h")).rejects.toBeTruthy();
  });

  it("ineligible or inactive students cannot be given a link", async () => {
    await makeElection();
    const admin = await makeAdmin("ELECTION_ADMIN");
    const off = await makeStudent({ active: false });
    const wrongBatch = await makeStudent({ batch: "TechTitans-27" });
    await expect(createAccessLink(off.id, { hours: 2, reason: "" }, admin.id, "h")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(createAccessLink(wrongBatch.id, { hours: 2, reason: "" }, admin.id, "h")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});
