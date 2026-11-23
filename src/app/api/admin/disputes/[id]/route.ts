import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { disputeUpdateSchema, updateDispute } from "@/lib/services/disputes";

export const PATCH = adminRoute<{ id: string }>("disputes.manage", async (req, { admin, c, params }) => {
  await updateDispute(assertUuid(params.id), await parseJson(req, disputeUpdateSchema), admin.adminId, c.ipHash);
  return ok();
});
