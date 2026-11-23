import "server-only";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, dict, type Lang } from "./i18n";

/** Visitor's language: explicit choice (cookie) first, then the browser's preference. Default English. */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (c === "bn" || c === "en") return c;
  const accept = (await headers()).get("accept-language") ?? "";
  const first = accept.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("bn") ? "bn" : "en";
}

export async function getDict() {
  const lang = await getLang();
  return { lang, t: dict(lang) };
}
