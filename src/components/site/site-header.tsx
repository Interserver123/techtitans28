import Link from "next/link";
import { Brand } from "./brand";
import { StatusPill } from "./status-pill";
import { LanguageToggle } from "./language-toggle";
import { Button } from "@/components/ui/button";
import { dict, type Lang } from "@/lib/i18n";

export function SiteHeader({ status, canVote, lang }: { status: string | null; canVote: boolean; lang: Lang }) {
  const t = dict(lang);
  const NAV = [
    { href: "/#candidates", label: t.nav.candidates },
    { href: "/#how-it-works", label: t.nav.how },
    { href: "/#guidelines", label: t.nav.guidelines },
    { href: "/results", label: t.nav.results },
    { href: "/#committee", label: t.nav.committee },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-gold/30 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Brand lang={lang} />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-900/5 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <StatusPill status={status} lang={lang} className="hidden xl:inline-flex" />
          <LanguageToggle lang={lang} />
          <Button asChild size="sm" variant={canVote ? "default" : "outline"} className={canVote ? "hidden rounded-full bg-gradient-to-r from-emerald to-emerald-900 px-4 shadow-glow hover:brightness-110 sm:inline-flex" : "hidden rounded-full sm:inline-flex"}>
            <Link href="/vote">{canVote ? t.voteNow : t.voterPortal}</Link>
          </Button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line/60 px-3 py-1.5 lg:hidden" aria-label="Sections">
        <StatusPill status={status} lang={lang} className="mr-1 shrink-0" />
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
