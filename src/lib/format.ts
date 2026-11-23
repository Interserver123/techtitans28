export const TZ = "Asia/Dhaka";

const locale = (lang?: "en" | "bn") => (lang === "bn" ? "bn-BD" : "en-GB");

export function fmtDateTime(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = {}, lang?: "en" | "bn") {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: lang !== "bn", ...opts,
  }).format(new Date(d));
}

export function fmtDate(d: Date | string | null | undefined, lang?: "en" | "bn") {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, day: "2-digit", month: "long", year: "numeric" }).format(new Date(d));
}

export function fmtTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(d));
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

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Upcoming",
  LIVE: "Live",
  PAUSED: "Paused",
  CLOSED: "Closed",
  RESULTS_PUBLISHED: "Results Published",
};

export const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
