import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { adminCreateSchema, createAdmin } from "@/lib/services/admins";

export const POST = adminRoute("admins.manage", async (req, { admin, c }) => {
  const id = await createAdmin(await parseJson(req, adminCreateSchema), admin.adminId, c.ipHash);
  return ok({ id });
});
