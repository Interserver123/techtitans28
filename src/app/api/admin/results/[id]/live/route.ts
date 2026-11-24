import { adminRoute } from "@/lib/admin-route";
import { ok } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { getLiveTop3 } from "@/lib/services/results";

/** Super Admin only: live top 3 per position. The database re-checks the session and the role. */
export const GET = adminRoute<{ id: string }>(null, async (_req, { admin, params }) => {
  return ok({ positions: await getLiveTop3(admin.tokenHash, assertUuid(params.id)) });
});
