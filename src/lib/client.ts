"use client";

export type ApiError = { code: string; message: string; issues?: { path: string; message: string }[] };
export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: ApiError };

function csrf() {
  const m = document.cookie.match(/(?:^|;\s*)tt_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

/** fetch wrapper: same-origin, CSRF header, JSON or FormData, uniform error shape. */
export async function api<T = Record<string, unknown>>(url: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { "x-csrf-token": csrf() };
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) body = init.form;
  try {
    const res = await fetch(url, { method: init.method ?? (body ? "POST" : "GET"), headers, body, credentials: "same-origin", cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: { code: "NETWORK", message: `Unexpected response (${res.status}).` } };
    return data as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "NETWORK", message: "Network error — check your connection and try again." } };
  }
}
