import { route, ok, parseJson, requestContext } from "@/lib/http";
import { completeMfa, totpSchema } from "@/lib/services/admin-auth";
import { ADMIN_COOKIE, setAdminCookie } from "@/lib/session";

export const POST = route(async (req) => {
  const { code } = await parseJson(req, totpSchema);
  const token = await completeMfa(req.cookies.get(ADMIN_COOKIE)?.value ?? "", code, requestContext(req));
  const res = ok({ next: "/admin" });
  setAdminCookie(res, token, true);
  return res;
});
