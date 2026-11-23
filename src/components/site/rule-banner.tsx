import { dict, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** "Two votes: one boy, one girl" rule: shown on the home page and at the top of the ballot. */
export function RuleBanner({ lang, className }: { lang: Lang; className?: string }) {
  const rule = dict(lang).rule;
  return (
    <div className={cn("overflow-hidden rounded-2xl border-2 border-gold bg-gradient-to-br from-amber-100 via-amber-50 to-white p-4 text-sm shadow-card", className)}>
      <p className="font-display text-center text-lg font-extrabold leading-snug text-emerald-900 sm:text-xl">
        <mark className="rounded-lg bg-gold/40 px-2 py-0.5 text-emerald-900 [box-decoration-break:clone]">{rule.title}</mark>
      </p>
      <p className="mt-2 text-center leading-relaxed text-slate-700">{rule.body}</p>
    </div>
  );
}
