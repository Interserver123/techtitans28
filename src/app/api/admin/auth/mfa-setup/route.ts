import { route, ok } from "@/lib/http";
import { beginMfaEnrollment } from "@/lib/services/admin-auth";
import { ADMIN_COOKIE } from "@/lib/session";

export const POST = route(async (req) => {
  const r = await beginMfaEnrollment(req.cookies.get(ADMIN_COOKIE)?.value ?? "");
  return ok({ qrDataUrl: r.qrDataUrl, secret: r.secret });
});
