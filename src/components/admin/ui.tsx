import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { bnNum, STATUS_LABEL } from "@/lib/format";
import { EyeOff, Lock } from "lucide-react";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = "blue" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: "blue" | "green" | "amber" | "red" | "slate" }) {
  const tones = { blue: "text-gold bg-gold/10", green: "text-green-400 bg-green-500/10", amber: "text-amber-400 bg-amber-500/10", red: "text-red-400 bg-red-500/10", slate: "text-slate-300 bg-white/5" };
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-navy-800 to-[#0e1628] p-5 shadow-[0_1px_0_rgb(255_255_255/0.04)_inset] transition hover:border-electric/30"><div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-electric/10 blur-2xl transition group-hover:bg-electric/20" />
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        {Icon && <span className={cn("rounded-lg p-1.5", tones[tone])}><Icon className="size-4" /></span>}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-white">{typeof value === "number" ? bnNum(value) : value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const statusTone = { DRAFT: "neutral", SCHEDULED: "blue", LIVE: "green", PAUSED: "amber", CLOSED: "neutral", RESULTS_PUBLISHED: "violet" } as const;
export function ElectionStatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status as keyof typeof statusTone] ?? "neutral"}>{status === "LIVE" && <span className="size-1.5 rounded-full bg-green-400 animate-pulse-dot" />}{STATUS_LABEL[status] ?? status}</Badge>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-400">{children}</div>;
}

export function Sealed({ title = "ফলাফল সিলগালা", children }: { title?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/[0.07] bg-navy-800 p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-white/5"><Lock className="size-5 text-slate-300" /></span>
      <p className="mt-4 font-semibold text-white">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-400">{children ?? "নির্বাচন শেষ না হওয়া পর্যন্ত প্রার্থীভিত্তিক গণনা করা যায় না। এটি সরাসরি ডেটাবেস থেকেই নিয়ন্ত্রিত।"}</p>
      <EyeOff className="mt-4 size-4 text-slate-600" />
    </div>
  );
}

export function NoElection() {
  return <Empty>কোনো নির্বাচন বেছে নেওয়া হয়নি। <a className="text-gold underline" href="/admin/elections">নির্বাচন</a> পাতা থেকে একটি তৈরি করুন।</Empty>;
}
