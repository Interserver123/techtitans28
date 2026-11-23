import Link from "next/link";
import { SearchX } from "lucide-react";
import { getLang } from "@/lib/i18n-server";
import { num } from "@/lib/i18n";

export const metadata = { title: "পাতা পাওয়া যায়নি · Page not found" };

const TEXT = {
  bn: { title: "পাতাটি পাওয়া যায়নি", body: "আপনি যে পাতাটি খুঁজছেন, সেটি নেই অথবা সরিয়ে ফেলা হয়েছে।", home: "প্রথম পাতায় ফিরে যান" },
  en: { title: "Page not found", body: "The page you are looking for does not exist or has been moved.", home: "Back to the home page" },
};

export default async function NotFound() {
  const lang = await getLang();
  const t = TEXT[lang];
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-3xl border border-gold/30 bg-surface p-8 text-center shadow-lift">
        <SearchX className="mx-auto size-10 text-emerald" aria-hidden />
        <p className="font-display mt-4 text-5xl font-bold text-emerald">{num(404, lang)}</p>
        <h1 className="font-display mt-2 text-2xl font-bold">{t.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.body}</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-electric px-5 text-sm font-semibold text-white hover:bg-electric-600">
          {t.home}
        </Link>
      </div>
    </div>
  );
}
