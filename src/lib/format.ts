export const TZ = "Asia/Dhaka";

// Bengali is the default: the admin dashboard is Bengali-only, and public pages pass the visitor's language explicitly.
type L = "en" | "bn";
const locale = (lang: L = "bn") => (lang === "bn" ? "bn-BD" : "en-GB");

export const LOCALE = "bn-BD";
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
/** Writes every ASCII digit in Bengali numerals (১২৩). */
export function bn(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(v).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}
/** Formats a number with Bengali digits and grouping. */
export function bnNum(n: number, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

export function fmtDateTime(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = {}, lang: L = "bn") {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: lang !== "bn", ...opts,
  }).format(new Date(d));
}

export function fmtDate(d: Date | string | null | undefined, lang: L = "bn") {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, day: "2-digit", month: "long", year: "numeric" }).format(new Date(d));
}

export function fmtTime(d: Date | string | null | undefined, lang: L = "bn") {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: lang !== "bn" }).format(new Date(d));
}

/** Converts a Date to the value of an <input type="datetime-local"> in Asia/Dhaka. */
export function toDhakaLocalInput(d: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(d));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

/** Interprets a datetime-local value as Asia/Dhaka time (UTC+6, no DST). */
export function fromDhakaLocalInput(v: string) {
  return new Date(`${v}:00+06:00`);
}

/** Bengali status names (admin dashboard and server messages). Public pages use the i18n dictionary. */
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "খসড়া",
  SCHEDULED: "আসন্ন",
  LIVE: "চলমান",
  PAUSED: "সাময়িক স্থগিত",
  CLOSED: "সমাপ্ত",
  RESULTS_PUBLISHED: "ফলাফল প্রকাশিত",
};

/** English formatting for the PDF report: pdf-lib's standard fonts cannot draw Bengali script. */
export function fmtDateTimeEn(d: Date | string | null | undefined) {
  return fmtDateTime(d, { hour12: true }, "en");
}

export const STATUS_LABEL_EN: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Upcoming",
  LIVE: "Live",
  PAUSED: "Paused",
  CLOSED: "Closed",
  RESULTS_PUBLISHED: "Results Published",
};

export const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
