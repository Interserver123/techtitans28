import Link from "next/link";
import { Brand } from "./brand";
import { StatusPill } from "./status-pill";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/#candidates", label: "Candidates" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#guidelines", label: "Guidelines" },
  { href: "/results", label: "Results" },
  { href: "/#committee", label: "Committee" },
];

export function SiteHeader({ status, canVote }: { status: string | null; canVote: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-gold/30 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Brand />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-900/5 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <StatusPill status={status} className="hidden sm:inline-flex" />
          <Button asChild size="sm" variant={canVote ? "default" : "outline"} className={canVote ? "rounded-full bg-gradient-to-r from-emerald to-emerald-900 px-4 shadow-glow hover:brightness-110" : "rounded-full"}>
            <Link href="/vote">{canVote ? "Vote now" : "Voter portal"}</Link>
          </Button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line/60 px-3 py-1.5 lg:hidden" aria-label="Sections">
        <StatusPill status={status} className="mr-1 shrink-0 sm:hidden" />
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
