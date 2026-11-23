import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/site/brand";

export const metadata = { title: "Voter portal", robots: { index: false } };

export default function VoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(59_130_246/0.14),transparent)]" aria-hidden />
      <header className="relative z-10 border-b border-line/70 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Brand />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
            <ShieldCheck className="size-3.5" /> Secure ballot
          </span>
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">{children}</main>
      <footer className="pb-8 text-center text-xs text-muted">
        <Link href="/" className="hover:text-ink">Election home</Link> · <Link href="/help" className="hover:text-ink">Need help?</Link>
      </footer>
    </div>
  );
}
