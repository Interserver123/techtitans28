"use client";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

type T = { eligible: number; voted: number; turnoutPct: number };

/** Polls aggregate turnout (never candidate data) while voting is live. */
export function LiveTurnout({ initial, live, dark = false }: { initial: T; live: boolean; dark?: boolean }) {
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
          <p className={dark ? "text-xs font-medium uppercase tracking-wider text-slate-400" : "text-xs font-medium uppercase tracking-wider text-muted"}>Voter turnout</p>
          <p className={dark ? "mt-1 text-3xl font-bold tabular-nums text-white" : "mt-1 text-3xl font-bold tabular-nums"}>{t.turnoutPct}%</p>
        </div>
        <p className={dark ? "pb-1 text-sm tabular-nums text-slate-400" : "pb-1 text-sm tabular-nums text-muted"}>
          <span className={dark ? "font-semibold text-white" : "font-semibold text-ink"}>{t.voted}</span> of {t.eligible} voted
        </p>
      </div>
      <Progress value={t.turnoutPct} className={dark ? "mt-3 bg-white/10" : "mt-3"} label="Voter turnout" />
      {live && (
        <p className={dark ? "mt-2 flex items-center gap-1.5 text-[11px] text-slate-500" : "mt-2 flex items-center gap-1.5 text-[11px] text-muted"}>
          <span className="size-1.5 rounded-full bg-success animate-pulse-dot" /> Updates automatically
        </p>
      )}
    </div>
  );
}
