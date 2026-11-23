import { adminRoute } from "@/lib/admin-route";
import { ok } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { resetAdminMfa } from "@/lib/services/admins";

export const POST = adminRoute<{ id: string }>("admins.manage", async (_req, { admin, c, params }) => {
  await resetAdminMfa(assertUuid(params.id), admin.adminId, c.ipHash);
  return ok();
});
