import Link from "next/link";
import { Brand } from "./brand";

export function SiteFooter({ institution, department }: { institution: string; department: string }) {
  return (
    <footer className="relative bg-navy text-slate-400"><div className="hairline-gold" aria-hidden />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Brand dark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            The official Class Representative election portal of TechTitans-28, {department}, {institution}.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Election</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" href="/vote">Voter portal</Link></li>
            <li><Link className="hover:text-white" href="/results">Results &amp; turnout</Link></li>
            <li><Link className="hover:text-white" href="/verify-receipt">Verify a receipt</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Support</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" href="/help">Report a problem</Link></li>
            <li><Link className="hover:text-white" href="/#guidelines">Voting guidelines</Link></li>
            <li><Link className="hover:text-white" href="/admin/login">Committee sign-in</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} TechTitans-28 Election Committee · {institution}</p>
          <p>One student · one ballot · secret vote</p>
        </div>
      </div>
    </footer>
  );
}
