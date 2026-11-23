import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { stepUpMfa, totpSchema, STEP_UP_MINUTES } from "@/lib/services/admin-auth";

/** Re-confirm the authenticator code before a sensitive action. */
export const POST = adminRoute(null, async (req, { admin, c }) => {
  const { code } = await parseJson(req, totpSchema);
  await stepUpMfa(admin, code, c);
  return ok({ validMinutes: STEP_UP_MINUTES });
});
