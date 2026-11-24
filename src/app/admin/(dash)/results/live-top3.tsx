"use client";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bnNum } from "@/lib/format";
import { posLabel } from "@/lib/i18n";
import type { LiveTop3 } from "@/lib/services/results";

/** Super Admin only (the page and the API both enforce it). Refreshes every 10 seconds. */
export function LiveTop3({ electionId, initial, live }: { electionId: string; initial: LiveTop3[]; live: boolean }) {
  const [data, setData] = useState(initial);
  const [at, setAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/admin/results/${electionId}/live`, { cache: "no-store" });
        const d = await r.json();
        if (stop) return;
        if (r.ok && d?.positions) { setData(d.positions); setAt(new Date()); setFailed(false); } else setFailed(true);
      } catch { if (!stop) setFailed(true); }
    };
    const id = setInterval(tick, 10_000);
    return () => { stop = true; clearInterval(id); };
  }, [electionId, live]);
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white"><Trophy className="size-5 text-gold-300" /> লাইভ শীর্ষ ৩ প্রার্থী</CardTitle>
        <CardDescription>
          শুধু সুপার অ্যাডমিন দেখতে পারেন · প্রতি ১০ সেকেন্ডে স্বয়ংক্রিয় হালনাগাদ
          {live && <span className="ml-2 inline-flex items-center gap-1.5"><span className="size-1.5 animate-pulse-dot rounded-full bg-success" /> {failed ? "হালনাগাদ ব্যর্থ" : at ? `সর্বশেষ ${at.toLocaleTimeString("bn-BD")}` : "লাইভ"}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {data.map((p) => (
          <div key={p.position.id}>
            <p className="mb-2 text-sm font-semibold text-slate-200">{posLabel(p.position.gender, "bn", true)}</p>
            <ol className="space-y-2">
              {p.top.map((t) => (
                <li key={t.candidateId} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <span className="w-6 text-center font-bold text-gold-300">{bnNum(t.rank)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-100">{t.name} <span className="font-mono text-xs text-slate-400">{t.roll}</span></span>
                  <span className="font-bold tabular-nums text-white">{bnNum(t.votes)} ভোট</span>
                </li>
              ))}
              {p.top.length === 0 && <li className="text-sm text-slate-400">কোনো প্রার্থী নেই।</li>}
            </ol>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
