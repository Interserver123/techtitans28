import Link from "next/link";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/site/brand";

export const metadata = { title: "ভোটার পোর্টাল", robots: { index: false } };

export default function VoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="relative isolate overflow-hidden bg-emerald-900 text-white">
        <Image src="/campus/gate.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-center" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-900/90 via-emerald-900/80 to-emerald-900/95" />
        <header>
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
            <Brand dark />
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-gold-300">
              <ShieldCheck className="size-3.5" /> সুরক্ষিত ব্যালট
            </span>
          </div>
        </header>
        <div className="mx-auto max-w-3xl px-4 pb-14 pt-6 sm:pb-16">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-300">ইসলামী বিশ্ববিদ্যালয় · আইসিটি</p>
          <p className="font-display mt-2 text-2xl text-white sm:text-3xl">আপনার কণ্ঠ। আপনার গোপন ব্যালট।</p>
        </div>
        <div className="gold-rule absolute inset-x-0 bottom-0" />
      </div>
      <main className="relative z-10 mx-auto -mt-8 w-full max-w-3xl flex-1 px-4 pb-8 sm:pb-12">
        <div className="rounded-3xl border border-gold/30 bg-surface p-5 shadow-lift sm:p-8">{children}</div>
      </main>
      <footer className="pb-8 text-center text-xs text-muted">
        <Link href="/" className="hover:text-ink">নির্বাচনের প্রথম পাতা</Link> · <Link href="/help" className="hover:text-ink">সাহায্য দরকার?</Link>
      </footer>
    </div>
  );
}
