import { route, ok, parseJson, requestContext } from "@/lib/http";
import { adminLogin, loginSchema } from "@/lib/services/admin-auth";
import { setAdminCookie } from "@/lib/session";

export const POST = route(async (req) => {
  const input = await parseJson(req, loginSchema);
  const { token, mfaEnrolled } = await adminLogin(input, requestContext(req));
  const res = ok({ next: mfaEnrolled ? "verify" : "enroll" });
  setAdminCookie(res, token, false);
  return res;
});
