import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { resetAdminPassword } from "@/lib/services/admins";

export const POST = adminRoute<{ id: string }>("admins.manage", async (req, { admin, c, params }) => {
  const { password } = await parseJson(req, z.object({ password: z.string().max(200) }));
  await resetAdminPassword(assertUuid(params.id), password, admin.adminId, c.ipHash);
  return ok();
});
