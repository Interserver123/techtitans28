import Link from "next/link";
import { SearchX } from "lucide-react";

export const metadata = { title: "পাতা পাওয়া যায়নি" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-3xl border border-gold/30 bg-surface p-8 text-center shadow-lift">
        <SearchX className="mx-auto size-10 text-emerald" aria-hidden />
        <p className="font-display mt-4 text-5xl font-bold text-emerald">৪০৪</p>
        <h1 className="font-display mt-2 text-2xl font-bold">পাতাটি পাওয়া যায়নি</h1>
        <p className="mt-2 text-sm text-muted">আপনি যে পাতাটি খুঁজছেন, সেটি নেই অথবা সরিয়ে ফেলা হয়েছে।</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-electric px-5 text-sm font-semibold text-white hover:bg-electric-600">
          প্রথম পাতায় ফিরে যান
        </Link>
      </div>
    </div>
  );
}
