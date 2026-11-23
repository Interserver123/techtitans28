import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { committeeSchema, updatePublicSettings } from "@/lib/services/settings";

export const PUT = adminRoute("settings.manage", async (req, { admin, c }) => {
  await updatePublicSettings(await parseJson(req, committeeSchema), admin.adminId, c.ipHash);
  return ok();
});
