import { getLang } from "@/lib/i18n-server";
import { dict } from "@/lib/i18n";
import { UrgentContact } from "@/components/site/urgent-contact";

export const metadata = { title: "শর্তাবলি · Terms & conditions" };

export default async function TermsPage() {
  const lang = await getLang();
  const t = dict(lang).terms;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t.title}</h1>
      <p className="mt-2 text-[15px] text-muted">{t.sub}</p>
      <ol className="mt-8 space-y-4">
        {t.items.map(([h, b], i) => (
          <li key={h} className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold text-emerald-900">{i + 1}. {h}</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-slate-700">{b}</p>
          </li>
        ))}
      </ol>
      <UrgentContact lang={lang} className="mt-8" />
    </div>
  );
}
