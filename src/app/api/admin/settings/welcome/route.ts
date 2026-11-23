import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { updateWelcomeMessage, welcomeSchema } from "@/lib/services/settings";

export const PUT = adminRoute("settings.manage", async (req, { admin, c }) => {
  await updateWelcomeMessage(await parseJson(req, welcomeSchema), admin.adminId, c.ipHash);
  return ok();
});
