"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Search, X } from "lucide-react";
import { initials } from "./candidate-avatar";
import { dict, num, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type C = { id: string; display_name: string; roll_number: string; introduction: string; photo_url: string | null };

const BN = "০১২৩৪৫৬৭৮৯";
const toLatin = (v: string) => v.replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));
const INITIAL = 12;

/** Gradients for photo-less candidates, picked by position so neighbouring cards differ. */
const TONES = [
  "from-emerald to-emerald-900",
  "from-[#c9a24a] to-[#8a6a22]",
  "from-[#173126] to-navy",
  "from-[#0b6040] to-[#173126]",
  "from-[#9c7a2e] to-[#3d2f10]",
  "from-[#234536] to-[#08140f]",
];

export function CandidateGrid({ candidates, lang }: { candidates: C[]; lang: Lang }) {
  const t = dict(lang).ui;
  const n = (v: string | number) => num(v, lang);
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const query = toLatin(q.trim().toLowerCase());
  const matches = useMemo(
    () => candidates.map((c, i) => ({ c, n: i + 1 })).filter(({ c }) => !query || c.display_name.toLowerCase().includes(query) || c.roll_number.toLowerCase().includes(query)),
    [candidates, query],
  );
  const shown = query || all ? matches : matches.slice(0, INITIAL);
  const hidden = matches.length - shown.length;

  return (
    <div className="mt-12">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <label className="relative flex-1">
          <span className="sr-only">{t.searchLabel}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchPh}
            className="h-12 w-full rounded-full border border-line bg-surface pl-11 pr-10 text-sm shadow-card outline-none transition placeholder:text-slate-400 focus:border-emerald focus:ring-4 focus:ring-emerald/15"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label={t.clear} className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-slate-100">
              <X className="size-4" />
            </button>
          )}
        </label>
        <span className="shrink-0 rounded-full bg-emerald/10 px-3 py-1.5 text-xs font-semibold text-emerald" aria-live="polite">
          {t.countShort(n(matches.length))}
        </span>
      </div>

      {matches.length === 0 ? (
        <p className="mt-10 rounded-3xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">{t.noMatch(q)}</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map(({ c, n: pos }) => (
            <li key={c.id}>
              <Link
                href={`/candidates/${c.id}`}
                className="group relative flex h-full gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-lift focus-visible:border-emerald"
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-gold to-emerald opacity-0 transition group-hover:opacity-100" aria-hidden />
                <span className="relative shrink-0">
                  {c.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photo_url} alt="" loading="lazy" className="size-14 rounded-2xl object-cover ring-2 ring-gold/40" />
                  ) : (
                    <span className={cn("flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white ring-2 ring-gold/30", TONES[(pos - 1) % TONES.length])} aria-hidden>
                      {initials(c.display_name)}
                    </span>
                  )}
                  <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border-2 border-surface bg-navy text-[10px] font-bold text-gold-300">{n(pos)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block font-semibold leading-snug text-ink">{c.display_name}</span>
                  <span className="mt-0.5 block text-xs text-muted">{t.roll} {n(c.roll_number)}</span>
                  {c.introduction && <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-slate-600">{c.introduction}</span>}
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald transition group-hover:gap-1.5">
                    {t.manifesto} <ArrowUpRight className="size-3.5" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-surface px-6 py-3 text-sm font-semibold text-ink shadow-card transition hover:border-gold hover:shadow-lift"
          >
            {t.showAll} <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-[#8a6a22]">{t.more(n(hidden))}</span> <ChevronDown className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
