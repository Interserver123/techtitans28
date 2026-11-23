import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { env } from "./env";
import { AppError, toAppError } from "./errors";
import { randomToken, safeEqual, ipHash } from "./crypto";

export const CSRF_COOKIE = "tt_csrf";
export const CSRF_HEADER = "x-csrf-token";

export type RequestContext = { ip: string | null; ipHash: string | null; userAgent: string | null };

export function requestContext(req: NextRequest | Request): RequestContext {
  const h = req.headers;
  let ip: string | null = null;
  if (env().TRUST_PROXY_HEADERS) {
    ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  }
  ip = ip ?? "local";
  return { ip, ipHash: ipHash(ip), userAgent: h.get("user-agent")?.slice(0, 400) ?? null };
}

/**
 * CSRF defence for state-changing requests:
 *  1. Origin (or Referer) must match APP_URL / the request host.
 *  2. Double-submit token: x-csrf-token header must equal the tt_csrf cookie.
 * Session cookies are additionally SameSite=Strict.
 */
export function assertCsrf(req: NextRequest) {
  const origin = req.headers.get("origin") ?? (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null);
  const allowed = new Set([new URL(env().APP_URL).origin, req.nextUrl.origin]);
  if (!origin || !allowed.has(origin)) throw new AppError("CSRF");
  const cookie = req.cookies.get(CSRF_COOKIE)?.value;
  const header = req.headers.get(CSRF_HEADER);
  if (!cookie || !header || !safeEqual(cookie, header)) throw new AppError("CSRF");
}

export const newCsrfToken = () => randomToken(24);

export async function parseJson<S extends z.ZodTypeAny>(req: Request, schema: S, maxBytes = 64 * 1024): Promise<z.infer<S>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE");
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE");
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("BAD_REQUEST");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? undefined,
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

export function errorResponse(err: unknown) {
  const e = toAppError(err);
  if (e.code === "INTERNAL") {
    // Log the internal error server-side without request bodies (which may contain OTPs).
    console.error("[internal-error]", (err as Error)?.name, (err as Error)?.message);
  }
  const body: Record<string, unknown> = { ok: false, error: { code: e.code, message: e.message } };
  if (e.code === "VALIDATION" && Array.isArray(e.details)) (body.error as Record<string, unknown>).issues = e.details;
  return NextResponse.json(body, { status: e.status, headers: { "cache-control": "no-store" } });
}

export function ok(data: Record<string, unknown> = {}, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler with CSRF protection (for mutations) and uniform error mapping. */
export function route<C = unknown>(handler: Handler<C>, opts: { csrf?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating && opts.csrf !== false) assertCsrf(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export const secureCookie = () => env().APP_URL.startsWith("https://");
