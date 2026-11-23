import { route, ok } from "@/lib/http";
import { getCurrentElection, getTurnout, isVotingOpen } from "@/lib/services/elections";

/** Public, aggregate-only election status. */
export const GET = route(async () => {
  const e = await getCurrentElection();
  if (!e) return ok({ election: null });
  return ok({
    election: { id: e.id, title: e.title, status: e.status, opensAt: e.opens_at, closesAt: e.closes_at, votingOpen: isVotingOpen(e) },
    turnout: await getTurnout(e),
    serverTime: new Date().toISOString(),
  });
});
