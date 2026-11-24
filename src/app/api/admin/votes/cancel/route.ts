import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { cancelVote, cancelVoteSchema } from "@/lib/services/vote-records";

/**
 * Super Admin: cancel all of a voter's current ballots (one Super Admin, takes effect at once).
 * The database re-checks the live session, the Super Admin role and a fresh authenticator code,
 * keeps the ballots (marked invalidated) and writes the audit log.
 */
export const POST = adminRoute("votes.read", async (req, { admin, c }) => {
  const cancelled = await cancelVote(admin.tokenHash, await parseJson(req, cancelVoteSchema), c.ipHash);
  return ok({ cancelled });
}, { stepUp: true });
