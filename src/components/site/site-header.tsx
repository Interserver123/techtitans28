"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, Vote, X } from "lucide-react";
import { Brand } from "./brand";
import { StatusPill } from "./status-pill";
import { cn } from "@/lib/utils";

const NAV = [
  { id: "candidates", href: "/#candidates", label: "প্রার্থী" },
  { id: "how-it-works", href: "/#how-it-works", label: "ভোট দেবেন যেভাবে" },
  { id: "guidelines", href: "/#guidelines", label: "নির্দেশিকা" },
  { id: "results", href: "/results", label: "ফলাফল" },
  { id: "committee", href: "/#committee", label: "কমিটি" },
];
const BN = "০১২৩৪৫৬৭৮৯";

export function SiteHeader({ status, canVote }: { status: string | null; canVote: boolean }) {
  const path = usePathname();
  const home = path === "/";
  const [scrolled, setScrolled] = useState(false);
  // The menu remembers the page it was opened on, so navigating anywhere closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === path;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenedOn((typeof v === "function" ? v(open) : v) ? path : null);
  const [spy, setSpy] = useState<string | null>(null);
  const active = home ? spy : path.startsWith("/results") ? "results" : null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Highlights the homepage section currently in view.
  useEffect(() => {
    if (!home) return;
    const els = NAV.map((n) => document.getElementById(n.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setSpy(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [home]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedOn(null);
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  // Over the homepage photo the bar is transparent with light text; elsewhere (or once scrolled) it is solid.
  const glass = home && !scrolled && !open;

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300",
          glass ? "border-b border-transparent bg-transparent" : "border-b border-gold/25 bg-white/85 shadow-[0_8px_30px_-18px_rgb(8_20_15/0.35)] backdrop-blur-xl",
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[72px] sm:px-6">
          <Brand dark={glass} />

          <nav aria-label="প্রধান মেনু" className={cn("hidden items-center gap-1 rounded-full p-1 lg:flex", glass ? "bg-white/10 ring-1 ring-white/15 backdrop-blur-md" : "bg-slate-900/[0.04]")}>
            {NAV.map((n) => {
              const on = active === n.id;
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "relative rounded-full px-4 py-2 text-sm font-medium transition",
                    on
                      ? glass ? "bg-white text-navy shadow-sm" : "bg-emerald text-white shadow-sm"
                      : glass ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-slate-600 hover:bg-white hover:text-ink",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <StatusPill status={status} className={cn("hidden sm:inline-flex", glass && "bg-white/10 text-white ring-white/20")} />
            <Link
              href="/vote"
              className={cn(
                "hidden items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition sm:inline-flex",
                canVote ? "bg-gold text-navy shadow-[0_8px_24px_-10px_rgb(201_162_74/0.9)] hover:bg-gold-300" : glass ? "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20" : "bg-emerald text-white hover:bg-emerald-900",
              )}
            >
              <Vote className="size-4" /> {canVote ? "এখনই ভোট দিন" : "ভোটার পোর্টাল"}
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "মেনু বন্ধ করুন" : "মেনু খুলুন"}
              className={cn("flex size-10 items-center justify-center rounded-full transition lg:hidden", glass ? "bg-white/10 text-white ring-1 ring-white/20" : "bg-slate-900/5 text-ink")}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>
      {!home && <div className="h-16 sm:h-[72px]" aria-hidden />}

      {/* Mobile / tablet menu */}
      <div
        id="mobile-menu"
        className={cn(
          "fixed inset-0 z-40 overflow-y-auto bg-emerald-900 text-white transition duration-300 lg:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
        aria-hidden={!open}
      >
        <Image src="/campus/aerial.jpg" alt="" fill sizes="100vw" className="object-cover opacity-20" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/70 via-emerald-900/95 to-navy" aria-hidden />
        <div className="relative flex min-h-full flex-col px-6 pb-10 pt-24">
          <StatusPill status={status} className="self-start bg-white/10 text-white ring-white/20" />
          <nav aria-label="মোবাইল মেনু" className="mt-6">
            <ul className="divide-y divide-white/10 border-y border-white/10">
              {NAV.map((n, i) => (
                <li key={n.id} className={cn("transition duration-500", open ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0")} style={{ transitionDelay: open ? `${80 + i * 50}ms` : "0ms" }}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="group flex items-center gap-4 py-4">
                    <span className="font-display w-8 text-sm text-gold-300">{BN[0]}{BN[i + 1]}</span>
                    <span className={cn("font-display flex-1 text-2xl", active === n.id ? "text-gold-300" : "text-white")}>{n.label}</span>
                    <ArrowUpRight className="size-5 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-gold-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link href="/vote" onClick={() => setOpen(false)} className="mt-8 flex h-14 items-center justify-center gap-2 rounded-2xl bg-gold text-base font-semibold text-navy">
            <Vote className="size-5" /> {canVote ? "এখনই ভোট দিন" : "ভোটার পোর্টাল"}
          </Link>
          <Link href="/verify-receipt" onClick={() => setOpen(false)} className="mt-3 flex h-12 items-center justify-center rounded-2xl text-sm font-medium text-white/80 ring-1 ring-white/20">
            রসিদ যাচাই করুন
          </Link>
          <p className="mt-auto pt-10 text-center text-xs text-white/50">ইসলামী বিশ্ববিদ্যালয় · তথ্য ও যোগাযোগ প্রযুক্তি বিভাগ</p>
        </div>
      </div>
    </>
  );
}
