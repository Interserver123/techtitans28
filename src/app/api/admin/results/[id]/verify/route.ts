import { adminRoute } from "@/lib/admin-route";
import { ok } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { verifyResults } from "@/lib/services/results";

export const POST = adminRoute<{ id: string }>("results.verify", async (_req, { admin, c, params }) => {
  const hash = await verifyResults(assertUuid(params.id), admin.adminId, c.ipHash);
  return ok({ hash });
});
