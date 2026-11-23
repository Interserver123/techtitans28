"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, ClipboardCheck, FileClock, Gauge, GraduationCap, LifeBuoy, LogOut, Menu, MessageSquareHeart, Settings, ShieldHalf, UserCog, Users, Vote, X,
} from "lucide-react";
import Image from "next/image";
import { Brand } from "@/components/site/brand";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/format";
import { ToastProvider } from "./toast";

const NAV = [
  { href: "/admin", label: "সারসংক্ষেপ", icon: Gauge, perm: null },
  { href: "/admin/elections", label: "নির্বাচন", icon: Vote, perm: "elections.read" },
  { href: "/admin/students", label: "শিক্ষার্থী", icon: GraduationCap, perm: "students.read" },
  { href: "/admin/candidates", label: "প্রার্থী", icon: Users, perm: "candidates.read" },
  { href: "/admin/results", label: "ফলাফল", icon: BarChart3, perm: "results.view" },
  { href: "/admin/corrections", label: "সংশোধন", icon: ClipboardCheck, perm: "corrections.read" },
  { href: "/admin/disputes", label: "অভিযোগ", icon: LifeBuoy, perm: "disputes.read" },
  { href: "/admin/audit", label: "অডিট লগ", icon: FileClock, perm: "audit.read" },
  { href: "/admin/admins", label: "অ্যাডমিন", icon: UserCog, perm: "admins.manage" },
  { href: "/admin/welcome", label: "স্বাগত বার্তা", icon: MessageSquareHeart, perm: "settings.manage" },
  { href: "/admin/settings", label: "সেটিংস", icon: Settings, perm: "settings.manage" },
] as const;

type Props = {
  admin: { name: string; email: string; role: string; permissions: string[] };
  elections: { id: string; title: string; status: string }[];
  selectedId: string | null;
  children: React.ReactNode;
};

export function AdminShell({ admin, elections, selectedId, children }: Props) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const nav = NAV.filter((n) => !n.perm || admin.permissions.includes(n.perm));
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  const sidebar = (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Image src="/campus/building.jpg" alt="" fill sizes="288px" className="object-cover opacity-[0.12] mix-blend-luminosity" aria-hidden />
      <div className="gold-rule absolute inset-x-0 top-16" />
      <div className="relative flex h-16 items-center justify-between px-5">
        <Brand dark href="/admin" />
        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="মেনু বন্ধ করুন"><X className="size-5" /></button>
      </div>
      <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="অ্যাডমিন মেনু">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}
            className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              isActive(href) ? "bg-gold/10 text-white ring-1 ring-inset ring-gold/30" : "text-slate-400 hover:bg-white/5 hover:text-white")}>
            <Icon className={cn("size-4", isActive(href) && "text-gold")} /> {label}
          </Link>
        ))}
      </nav>
      <div className="relative border-t border-gold/20 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-300">
            {admin.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{admin.name}</p>
            <p className="flex items-center gap-1 truncate text-xs text-slate-500"><ShieldHalf className="size-3" /> {admin.role}</p>
          </div>
          <button aria-label="লগআউট" title="লগআউট" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            onClick={async () => { await api("/api/admin/auth/logout", { method: "POST" }); router.replace("/admin/login"); router.refresh(); }}>
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="theme-admin dark min-h-dvh">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/5 bg-navy lg:block">{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 border-r border-white/10 bg-navy">{sidebar}</aside>
          </div>
        )}
        <div className="lg:pl-64">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-gold/20 bg-navy/85 px-4 backdrop-blur-xl sm:px-6">
            <button className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden" onClick={() => setOpen(true)} aria-label="মেনু খুলুন"><Menu className="size-5" /></button>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <label htmlFor="election-select" className="hidden text-xs font-medium uppercase tracking-wider text-slate-500 sm:block">নির্বাচন</label>
              <select id="election-select" value={selectedId ?? ""} disabled={!elections.length}
                onChange={(e) => { document.cookie = `tt_admin_election=${e.target.value}; path=/admin; samesite=strict`; router.refresh(); }}
                className="h-9 min-w-0 max-w-full truncate rounded-lg border border-white/10 bg-navy-800 px-3 text-sm text-slate-100 outline-none focus:border-electric">
                {!elections.length && <option value="">এখনো কোনো নির্বাচন নেই</option>}
                {elections.map((e) => <option key={e.id} value={e.id}>{e.title} — {STATUS_LABEL[e.status]}</option>)}
              </select>
            </div>
            <Link href="/" target="_blank" className="hidden rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white sm:block">পাবলিক সাইট দেখুন ↗</Link>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
