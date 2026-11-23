import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { updateElection } from "@/lib/services/elections";
import { one, query } from "@/lib/db";
import { makeAdmin, makeElection, resetVolatile, setElectionStatus, teardown } from "./helpers/fixtures";

const min = (n: number) => new Date(Date.now() + n * 60_000);
const times = async (id: string) => one<{ opens_at: Date; closes_at: Date }>(`select opens_at, closes_at from elections where id = $1`, [id]);
const input = (opens: Date, closes: Date) => ({ title: "Window test election", description: "", opensAt: opens, closesAt: closes });

describe("Super Admin can edit start and end time (until the election is closed)", () => {
  beforeEach(resetVolatile);
  afterAll(teardown);

  it("LIVE election: Super Admin changes BOTH times; an Election Admin still cannot", async () => {
    const e = await makeElection({ status: "LIVE", opensInMin: -30, closesInMin: 120 });
    const sup = await makeAdmin("SUPER_ADMIN");
    const normal = await makeAdmin("ELECTION_ADMIN");
    const t0 = await times(e.electionId);

    // Election Admin: start time locked, closing time cannot be shortened
    await expect(updateElection(e.electionId, input(min(-60), new Date(t0!.closes_at)), normal.id, "h", "ELECTION_ADMIN")).rejects.toMatchObject({ code: "ELECTION_LOCKED" });
    await expect(updateElection(e.electionId, input(new Date(t0!.opens_at), min(30)), normal.id, "h", "ELECTION_ADMIN")).rejects.toMatchObject({ code: "ELECTION_LOCKED" });

    // Super Admin: earlier start + SHORTER (but still future) close
    await updateElection(e.electionId, input(min(-90), min(45)), sup.id, "h", "SUPER_ADMIN");
    const t1 = await times(e.electionId);
    expect(Math.abs(new Date(t1!.opens_at).getTime() - min(-90).getTime())).toBeLessThan(5000);
    expect(Math.abs(new Date(t1!.closes_at).getTime() - min(45).getTime())).toBeLessThan(5000);
    // ... and a later close
    await updateElection(e.electionId, input(min(-90), min(600)), sup.id, "h", "SUPER_ADMIN");
    expect(Math.abs(new Date((await times(e.electionId))!.closes_at).getTime() - min(600).getTime())).toBeLessThan(5000);

    const audit = await query<{ action: string }>(`select action from audit_logs where action = 'ELECTION.WINDOW_CHANGED' and entity_id = $1`, [e.electionId]);
    expect(audit.length).toBe(2);
  });

  it("while voting is underway: no instant close and no future start through the time editor", async () => {
    const e = await makeElection({ status: "LIVE", opensInMin: -30, closesInMin: 120 });
    const sup = await makeAdmin("SUPER_ADMIN");
    await expect(updateElection(e.electionId, input(min(-60), min(-1)), sup.id, "h", "SUPER_ADMIN")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(updateElection(e.electionId, input(min(10), min(300)), sup.id, "h", "SUPER_ADMIN")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(updateElection(e.electionId, input(min(-5), min(-10)), sup.id, "h", "SUPER_ADMIN")).rejects.toBeTruthy();
    const t = await times(e.electionId);
    expect(new Date(t!.closes_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("SCHEDULED election: Super Admin can move both times", async () => {
    const e = await makeElection({ status: "SCHEDULED", opensInMin: 60, closesInMin: 600 });
    const sup = await makeAdmin("SUPER_ADMIN");
    await updateElection(e.electionId, input(min(120), min(900)), sup.id, "h", "SUPER_ADMIN");
    expect(Math.abs(new Date((await times(e.electionId))!.opens_at).getTime() - min(120).getTime())).toBeLessThan(5000);
  });

  it("a CLOSED election stays locked, even for the Super Admin", async () => {
    const e = await makeElection({ status: "LIVE", opensInMin: -30, closesInMin: 120 });
    const sup = await makeAdmin("SUPER_ADMIN");
    await setElectionStatus(e.electionId, "CLOSED");
    await expect(updateElection(e.electionId, input(min(-90), min(500)), sup.id, "h", "SUPER_ADMIN")).rejects.toBeTruthy();
  });

  it("the database function itself refuses anyone who is not an active Super Admin", async () => {
    const e = await makeElection({ status: "LIVE", opensInMin: -30, closesInMin: 120 });
    const normal = await makeAdmin("ELECTION_ADMIN");
    await expect(query(`select admin_set_election_window($1, $2, $3, $4, 'h')`, [e.electionId, normal.id, min(-60), min(500)])).rejects.toThrow(/FORBIDDEN/);
    await expect(query(`select admin_set_election_window($1, gen_random_uuid(), $2, $3, 'h')`, [e.electionId, min(-60), min(500)])).rejects.toThrow(/FORBIDDEN/);
  });
});
