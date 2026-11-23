import { adminRoute } from "@/lib/admin-route";
import { ok } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { cancelCorrection } from "@/lib/services/corrections";

export const POST = adminRoute<{ id: string }>("corrections.create", async (_req, { admin, c, params }) => {
  await cancelCorrection(assertUuid(params.id), admin.adminId, c.ipHash);
  return ok();
});
