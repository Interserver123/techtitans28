import { DisputeForm } from "./dispute-form";
import { getPublicSettings } from "@/lib/services/settings";
import { getDict } from "@/lib/i18n-server";

export const metadata = { title: "Help & disputes" };

export default async function HelpPage() {
  const s = await getPublicSettings();
  const { lang, t } = await getDict();
  const H = t.help;
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">{H.eyebrow}</p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">{H.title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {H.sub}
        </p>
        <div className="mt-6 space-y-3 text-sm leading-relaxed text-slate-700">
          <p><strong>{H.misuseT}</strong> {H.misuse}</p>
          <p><strong>{H.codeT}</strong> {H.code}</p>
        </div>
        {(s.contact.email || s.contact.phone || s.contact.office) && (
          <div className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm">
            <p className="font-semibold">{H.contact}</p>
            {s.contact.email && <p className="mt-1 text-muted">{s.contact.email}</p>}
            {s.contact.phone && <p className="text-muted">{s.contact.phone}</p>}
            {s.contact.office && <p className="text-muted">{s.contact.office}</p>}
          </div>
        )}
      </div>
      <DisputeForm categories={H.categories} lang={lang} />
    </div>
  );
}
