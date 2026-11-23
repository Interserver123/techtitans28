import { ReceiptVerifier } from "./verifier";
import { getDict } from "@/lib/i18n-server";

export const metadata = { title: "Verify a receipt" };

export default async function VerifyReceiptPage() {
  const { lang, t } = await getDict();
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">{t.verify.eyebrow}</p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">{t.verify.title}</h1>
      <p className="mt-2 text-[15px] text-muted">
        {t.verify.sub}
      </p>
      <ReceiptVerifier lang={lang} />
    </div>
  );
}
