"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { CandidateAvatar } from "./candidate-avatar";
import { dict, num, type Lang } from "@/lib/i18n";

type C = { id: string; display_name: string; roll_number: string; photo_url: string | null };

/** Compact, searchable candidate grid for elections with many candidates. */
export function CandidateRoster({ candidates, lang }: { candidates: C[]; lang: Lang }) {
  const t = dict(lang).cand;
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? candidates.filter((c) => c.display_name.toLowerCase().includes(s) || c.roll_number.toLowerCase().includes(s)) : candidates;
  }, [q, candidates]);
  return (
    <div className="mt-12">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 sm:flex-row">
        <label className="relative w-full">
          <span className="sr-only">{t.search}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} type="search"
            className="h-12 w-full rounded-full border border-gold/40 bg-surface pl-11 pr-4 text-sm shadow-card outline-none transition focus:border-emerald focus:ring-4 focus:ring-emerald/15"
          />
        </label>
        <span className="shrink-0 rounded-full bg-emerald-900 px-4 py-2 text-xs font-semibold text-gold-300">{t.count(num(shown.length, lang))}</span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">{t.noMatch}</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((c) => {
            const n = candidates.indexOf(c) + 1;
            return (
              <li key={c.id}>
                <Link
                  href={`/candidates/${c.id}`}
                  className="group relative flex h-full flex-col items-center rounded-2xl border border-line bg-surface px-3 pb-4 pt-5 text-center shadow-card transition duration-300 hover:-translate-y-1 hover:border-gold/60 hover:shadow-lift"
                >
                  <span className="absolute left-2.5 top-2.5 rounded-full border border-gold/50 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                    {t.no} {num(String(n).padStart(2, "0"), lang)}
                  </span>
                  <CandidateAvatar name={c.display_name} url={c.photo_url} className="mt-3 size-20 rounded-full text-xl ring-4 ring-gold/20 transition group-hover:ring-gold/50" />
                  <p className="font-display mt-3 line-clamp-2 text-[15px] font-semibold leading-snug">{c.display_name}</p>
                  <p className="mt-0.5 text-xs text-muted">{t.roll} {c.roll_number}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-electric-600 opacity-80 transition group-hover:opacity-100">
                    {t.read} <ArrowUpRight className="size-3.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
