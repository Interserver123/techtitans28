import { cn } from "@/lib/utils";
import { dict, type Lang } from "@/lib/i18n";

const tone: Record<string, string> = {
  LIVE: "bg-green-50 text-green-700 ring-green-200",
  SCHEDULED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PAUSED: "bg-amber-50 text-amber-800 ring-amber-200",
  CLOSED: "bg-slate-100 text-slate-700 ring-slate-200",
  RESULTS_PUBLISHED: "bg-violet-50 text-violet-700 ring-violet-200",
  NONE: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function StatusPill({ status, className, lang = "en" }: { status: string | null; className?: string; lang?: Lang }) {
  const s = status ?? "NONE";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset", tone[s] ?? tone.NONE, className)}>
      <span className={cn("size-2 rounded-full", s === "LIVE" ? "bg-success animate-pulse-dot" : s === "PAUSED" ? "bg-warning" : s === "SCHEDULED" ? "bg-electric" : s === "RESULTS_PUBLISHED" ? "bg-violet-500" : "bg-slate-400")} />
      {dict(lang).status[s] ?? s}
    </span>
  );
}
