"use client";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { dict, num, type Lang } from "@/lib/i18n";

type T = { eligible: number; voted: number; turnoutPct: number };

/** Polls aggregate turnout (never candidate data) while voting is live. */
export function LiveTurnout({ initial, live, dark = false, lang = "en" }: { initial: T; live: boolean; dark?: boolean; lang?: Lang }) {
  const L = dict(lang).turnout;
  const [t, setT] = useState(initial);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/public/status", { cache: "no-store" });
        const d = await r.json();
        if (d?.turnout) setT(d.turnout);
      } catch {
        /* ignore transient errors */
      }
    }, 20_000);
    return () => clearInterval(id);
  }, [live]);
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={dark ? "text-xs font-medium uppercase tracking-wider text-slate-400" : "text-xs font-medium uppercase tracking-wider text-muted"}>{L.label}</p>
          <p className={dark ? "mt-1 text-3xl font-bold tabular-nums text-white" : "mt-1 text-3xl font-bold tabular-nums"}>{num(t.turnoutPct, lang)}%</p>
        </div>
        <p className={dark ? "pb-1 text-sm tabular-nums text-slate-400" : "pb-1 text-sm tabular-nums text-muted"}>
          {L.of(num(t.voted, lang), num(t.eligible, lang))}
        </p>
      </div>
      <Progress value={t.turnoutPct} className={dark ? "mt-3 bg-white/10" : "mt-3"} label={L.label} />
      {live && (
        <p className={dark ? "mt-2 flex items-center gap-1.5 text-[11px] text-slate-500" : "mt-2 flex items-center gap-1.5 text-[11px] text-muted"}>
          <span className="size-1.5 rounded-full bg-success animate-pulse-dot" /> {L.auto}
        </p>
      )}
    </div>
  );
}
