import { getPublicState } from "@/lib/services/public";
import { demoAvailable } from "@/lib/services/demo";
import { getLang } from "@/lib/i18n-server";
import { dict } from "@/lib/i18n";
import { DemoFlow } from "./demo-flow";

export const metadata = { title: "ডেমো ভোট · Demo vote", robots: { index: false } };

export default async function DemoPage() {
  const [{ election, candidates, positions }, lang] = await Promise.all([getPublicState(), getLang()]);
  const t = dict(lang).demo;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rounded-2xl border-2 border-dashed border-gold bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-[#8a6a22]">{t.banner}</div>
      <h1 className="font-display mt-6 text-3xl font-bold sm:text-4xl">{t.title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{t.sub}</p>
      {!demoAvailable(election) ? (
        <p className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center text-muted">{t.closed}</p>
      ) : (
        <DemoFlow lang={lang} positions={positions.map((p) => ({ id: p.id, gender: p.gender }))} candidates={candidates.map((c) => ({ id: c.id, pos: c.position_id, name: c.display_name, roll: c.roll_number, photo: c.photo_url }))} />
      )}
    </div>
  );
}
