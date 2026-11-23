import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, dict, type Lang } from "./i18n";

/** Visitor's language: explicit choice (cookie) first, otherwise Bengali. English is one tap away on the language switch. */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return c === "en" ? "en" : "bn";
}

export async function getDict() {
  const lang = await getLang();
  return { lang, t: dict(lang) };
}
