import "server-only";
import type { NextRequest } from "next/server";
import { route, requestContext, type RequestContext } from "./http";
import { adminApi } from "./session";
import type { Permission } from "./permissions";
import { requireStepUp, type AdminIdentity } from "./services/admin-auth";

type Ctx<P> = { admin: AdminIdentity; c: RequestContext; params: P };

/**
 * Admin API route: CSRF + authenticated (password+MFA) session + permission check.
 * `stepUp: true` additionally needs an authenticator code entered in the last few minutes.
 */
export function adminRoute<P = Record<string, string>>(permission: Permission | null, handler: (req: NextRequest, ctx: Ctx<P>) => Promise<Response>, opts: { stepUp?: boolean } = {}) {
  return route<{ params: Promise<P> }>(async (req, ctx) => {
    const c = requestContext(req);
    const admin = await adminApi(req, permission, c);
    if (opts.stepUp) await requireStepUp(admin);
    const params = (await ctx?.params) ?? ({} as P);
    return handler(req, { admin, c, params });
  });
}

export async function readForm(req: NextRequest, maxBytes: number) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) {
    const { AppError } = await import("./errors");
    throw new AppError("PAYLOAD_TOO_LARGE");
  }
  return req.formData();
}

export async function fileBytes(f: FormDataEntryValue | null) {
  if (!f || typeof f === "string") return null;
  return Buffer.from(await f.arrayBuffer());
}
