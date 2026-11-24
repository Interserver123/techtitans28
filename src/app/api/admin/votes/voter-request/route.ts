import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { changeVoteOnRequest, voterRequestSchema } from "@/lib/services/vote-records";

/**
 * Super Admin: change a vote because the voter asked for it. Takes effect at once (one Super Admin),
 * while voting is live or paused or after it closes. The database re-checks the live session, the
 * Super Admin role and a fresh authenticator code, keeps the original ballot and writes the audit log.
 */
export const POST = adminRoute("votes.read", async (req, { admin, c }) => {
  const id = await changeVoteOnRequest(admin.tokenHash, await parseJson(req, voterRequestSchema), c.ipHash);
  return ok({ id });
}, { stepUp: true });
