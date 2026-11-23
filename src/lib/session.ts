import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity, requireAdmin, ADMIN_SESSION_HOURS } from "./services/admin-auth";
import { getVoterSession } from "./services/voter-auth";
import { ipHash } from "./crypto";
import { env } from "./env";
import { secureCookie, type RequestContext } from "./http";
import type { Permission } from "./permissions";
import { AppError } from "./errors";
import { audit } from "./audit";

export const ADMIN_COOKIE = "tt_admin";
export const VOTER_COOKIE = "tt_voter";
export const OTP_CHALLENGE_COOKIE = "tt_otp";

const base = () => ({ httpOnly: true, sameSite: "strict" as const, secure: secureCookie(), path: "/" });

export function setAdminCookie(res: NextResponse, token: string, mfaComplete: boolean) {
  res.cookies.set(ADMIN_COOKIE, token, { ...base(), maxAge: mfaComplete ? ADMIN_SESSION_HOURS * 3600 : 600 });
}
export function setVoterCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(VOTER_COOKIE, token, { ...base(), expires: expiresAt });
}
export function setChallengeCookie(res: NextResponse, challengeId: string) {
  res.cookies.set(OTP_CHALLENGE_COOKIE, challengeId, { ...base(), maxAge: 600 });
}
export function clearCookie(res: NextResponse, name: string) {
  res.cookies.set(name, "", { ...base(), maxAge: 0 });
}

/** Server-component context (pages). */
export async function pageContext(): Promise<RequestContext> {
  const h = await headers();
  const ip = env().TRUST_PROXY_HEADERS ? (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local") : "local";
  return { ip, ipHash: ipHash(ip), userAgent: h.get("user-agent")?.slice(0, 400) ?? null };
}

/** For admin pages: redirects to sign-in, or renders forbidden via thrown error. */
export async function adminPage(permission: Permission | null = null) {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const id = await getAdminIdentity(token);
  if (!id || !id.mfaEnabled || !id.mfaVerified) redirect("/admin/login");
  if (permission && !id.permissions.has(permission)) {
    await audit({ actorType: "ADMIN", adminId: id.adminId, action: "ADMIN.ACCESS_DENIED", entityType: "page", entityId: permission, ipHash: (await pageContext()).ipHash });
    redirect("/admin?denied=1");
  }
  return id;
}

/** For admin API routes. */
export async function adminApi(req: NextRequest, permission: Permission | null, ctx: RequestContext) {
  return requireAdmin(req.cookies.get(ADMIN_COOKIE)?.value, permission, ctx);
}

export async function voterFromCookies() {
  return getVoterSession((await cookies()).get(VOTER_COOKIE)?.value);
}

export function voterToken(req: NextRequest) {
  return req.cookies.get(VOTER_COOKIE)?.value ?? null;
}

export function assertUuid(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new AppError("NOT_FOUND");
  return id;
}
