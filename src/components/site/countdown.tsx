"use client";
import { useEffect, useState } from "react";
import { dict, num, type Lang } from "@/lib/i18n";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Counts down to `target`; renders server time initially to avoid hydration drift. */
export function Countdown({ target, serverNow, label, dark = false, lang = "en" }: { target: string; serverNow: string; label: string; dark?: boolean; lang?: Lang }) {
  const L = dict(lang).countdown;
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  useEffect(() => {
    // Offset between server and device clocks, measured once on mount.
    const skew = new Date(serverNow).getTime() - Date.now();
    const t = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(t);
  }, [serverNow]);
  const p = parts(new Date(target).getTime() - now);
  const cells: [string, number][] = [[L.days, p.d], [L.hours, p.h], [L.minutes, p.m], [L.seconds, p.s]];
  return (
    <div aria-live="off">
      <p className={dark ? "text-xs font-semibold uppercase tracking-[0.18em] text-gold-300/80" : "text-xs font-semibold uppercase tracking-[0.18em] text-muted"}>{label}</p>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:gap-3">
        {cells.map(([k, v]) => (
          <div key={k} className={dark ? "rounded-xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center backdrop-blur" : "rounded-xl border border-line bg-surface px-2 py-3 text-center shadow-card"}>
            <div className={dark ? "text-2xl font-bold tabular-nums text-white sm:text-3xl" : "text-2xl font-bold tabular-nums sm:text-3xl"} suppressHydrationWarning>
              {num(String(v).padStart(2, "0"), lang)}
            </div>
            <div className={dark ? "mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400" : "mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted"}>{k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
