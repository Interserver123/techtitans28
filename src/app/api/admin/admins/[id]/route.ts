import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { adminUpdateSchema, updateAdmin } from "@/lib/services/admins";

export const PATCH = adminRoute<{ id: string }>("admins.manage", async (req, { admin, c, params }) => {
  await updateAdmin(assertUuid(params.id), await parseJson(req, adminUpdateSchema), admin.adminId, c.ipHash);
  return ok();
});
