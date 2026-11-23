import { route, ok, requestContext } from "@/lib/http";
import { adminLogout } from "@/lib/services/admin-auth";
import { ADMIN_COOKIE, clearCookie } from "@/lib/session";

export const POST = route(async (req) => {
  await adminLogout(req.cookies.get(ADMIN_COOKIE)?.value, requestContext(req));
  const res = ok();
  clearCookie(res, ADMIN_COOKIE);
  return res;
});
