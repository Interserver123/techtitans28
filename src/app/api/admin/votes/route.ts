import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { choiceChangeSchema, requestChoiceChange } from "@/lib/services/vote-records";

/**
 * Super Admin: REQUEST a vote change (REPLACE_CHOICE correction). It takes effect only when a
 * different Super Admin approves it on the corrections page. The database re-checks the live
 * session, the Super Admin role and a fresh authenticator code.
 */
export const POST = adminRoute("votes.read", async (req, { admin, c }) => {
  const id = await requestChoiceChange(admin.tokenHash, await parseJson(req, choiceChangeSchema), c.ipHash);
  return ok({ id });
}, { stepUp: true });
