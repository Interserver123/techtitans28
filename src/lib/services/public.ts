import "server-only";
import { getCurrentElection, getTurnout, isVotingOpen } from "./elections";
import { listApprovedCandidates, listPositions } from "./voting";
import { getPublicSettings } from "./settings";

/** Everything the public site may show. Contains no candidate-wise counts. */
export async function getPublicState() {
  const [election, settings] = await Promise.all([getCurrentElection(), getPublicSettings()]);
  const turnout = election ? await getTurnout(election) : null;
  const candidates = election ? await listApprovedCandidates(election.id) : [];
  const positions = election ? await listPositions(election.id) : [];
  return {
    election,
    settings,
    turnout,
    candidates,
    positions,
    votingOpen: election ? isVotingOpen(election) : false,
    serverNow: new Date().toISOString(),
  };
}
export type PublicState = Awaited<ReturnType<typeof getPublicState>>;
