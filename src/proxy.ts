import { NextResponse, type NextRequest } from "next/server";

const CSRF_COOKIE = "tt_csrf";

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Runs before every page/API request:
 *  - strict, nonce-based Content-Security-Policy (XSS defence-in-depth)
 *  - issues the double-submit CSRF cookie if absent
 */
export function proxy(request: NextRequest) {
  const nonce = randomToken();
  const isDev = process.env.NODE_ENV === "development";
  const supabase = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(request.nextUrl.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  if (!request.cookies.get(CSRF_COOKIE)) {
    response.cookies.set(CSRF_COOKIE, randomToken(), {
      httpOnly: false, // must be readable by our own scripts to echo in the x-csrf-token header
      sameSite: "strict",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }
  if (request.nextUrl.pathname.startsWith("/admin") || request.nextUrl.pathname.startsWith("/vote")) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|campus|api/media).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
