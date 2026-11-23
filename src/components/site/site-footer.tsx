import Link from "next/link";
import Image from "next/image";
import { Brand } from "./brand";
import { Alpana } from "./alpana";
import { dict, num, type Lang } from "@/lib/i18n";
import { UrgentContact } from "./urgent-contact";

export function SiteFooter({ institution, department, lang }: { institution: string; department: string; lang: Lang }) {
  const t = dict(lang).footer;
  return (
    <footer className="relative overflow-hidden bg-emerald-900 text-slate-300">
      <Image src="/campus/building.jpg" alt="" fill sizes="100vw" className="object-cover opacity-20 mix-blend-luminosity" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-900 via-emerald-900/85 to-emerald-900/60" aria-hidden />
      <Alpana className="relative opacity-80" />
      <div className="relative">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Brand dark lang={lang} />
            <p className="mt-4 max-w-sm text-sm leading-relaxed">{t.about(department, institution)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-300/80">{t.election}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="hover:text-white" href="/vote">{t.links.portal}</Link></li>
              <li><Link className="hover:text-white" href="/results">{t.links.results}</Link></li>
              <li><Link className="hover:text-white" href="/verify-receipt">{t.links.verify}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-300/80">{t.support}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="hover:text-white" href="/help">{t.links.report}</Link></li>
              <li><Link className="hover:text-white" href="/#guidelines">{t.links.guide}</Link></li>
              <li><Link className="hover:text-white" href="/terms">{t.links.terms}</Link></li>
              <li><Link className="hover:text-white" href="/admin/login">{t.links.admin}</Link></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6"><UrgentContact lang={lang} tone="dark" /></div>
        <div className="border-t border-white/5">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>© {num(new Date().getFullYear(), lang)} {t.copyright}</p>
            <p>{t.tagline}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
