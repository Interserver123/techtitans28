import "server-only";
import { cookies } from "next/headers";
import { listElections, type Election } from "./services/elections";

export const ADMIN_ELECTION_COOKIE = "tt_admin_election";

/** The election an administrator is currently working on (selector in the top bar). */
export async function getAdminElections(): Promise<{ elections: Election[]; selected: Election | null }> {
  const elections = await listElections();
  const wanted = (await cookies()).get(ADMIN_ELECTION_COOKIE)?.value;
  const selected =
    elections.find((e) => e.id === wanted) ??
    elections.find((e) => ["SCHEDULED", "LIVE", "PAUSED"].includes(e.status)) ??
    elections[0] ??
    null;
  return { elections, selected };
}
