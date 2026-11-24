import { MessageCircleWarning } from "lucide-react";
import { dict, type Lang } from "@/lib/i18n";
import { URGENT_CONTACT_URL } from "@/lib/contact";
import { cn } from "@/lib/utils";

/** "Urgent problem? Knock here" — one link, shown on the voter portal, the footer and the help card. */
export function UrgentContact({ lang, tone = "light", className, title, body }: { lang: Lang; tone?: "light" | "dark"; className?: string; title?: string; body?: string }) {
  const t = { ...dict(lang).urgent, ...(title ? { title } : {}), ...(body ? { body } : {}) };
  const dark = tone === "dark";
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center", dark ? "border-white/15 bg-white/5 text-slate-200" : "border-gold/40 bg-amber-50/70 text-ink", className)}>
      <MessageCircleWarning className={cn("size-6 shrink-0", dark ? "text-gold-300" : "text-[#8a6a22]")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", dark ? "text-white" : "text-ink")}>{t.title}</p>
        <p className={cn("mt-0.5 text-xs leading-relaxed", dark ? "text-slate-300" : "text-slate-600")}>{t.body}</p>
      </div>
      <a href={URGENT_CONTACT_URL} target="_blank" rel="noopener noreferrer"
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#1877f2] px-4 text-sm font-semibold text-white transition hover:brightness-110">
        {t.cta}
      </a>
    </div>
  );
}
