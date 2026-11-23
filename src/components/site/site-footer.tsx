import Link from "next/link";
import Image from "next/image";
import { Brand } from "./brand";
import { bn } from "@/lib/format";

export function SiteFooter({ institution, department }: { institution: string; department: string }) {
  return (
    <footer className="relative overflow-hidden bg-emerald-900 text-slate-300">
      <Image src="/campus/building.jpg" alt="" fill sizes="100vw" className="object-cover opacity-20 mix-blend-luminosity" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-900 via-emerald-900/85 to-emerald-900/60" aria-hidden />
      <div className="gold-rule relative" />
      <div className="relative">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Brand dark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            টেকটাইটানস-২৮, {department}, {institution}-এর ক্লাস রিপ্রেজেন্টেটিভ (সিআর) নির্বাচনের অফিসিয়াল পোর্টাল।
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">নির্বাচন</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" href="/vote">ভোটার পোর্টাল</Link></li>
            <li><Link className="hover:text-white" href="/results">ফলাফল ও ভোটার উপস্থিতি</Link></li>
            <li><Link className="hover:text-white" href="/verify-receipt">রসিদ যাচাই করুন</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">সহায়তা</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" href="/help">সমস্যা জানান</Link></li>
            <li><Link className="hover:text-white" href="/#guidelines">ভোটদানের নির্দেশিকা</Link></li>
            <li><Link className="hover:text-white" href="/admin/login">কমিটির লগইন</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {bn(new Date().getFullYear())} টেকটাইটানস-২৮ নির্বাচন কমিটি · {institution}</p>
          <p>একজন শিক্ষার্থী · একটি ব্যালট · গোপন ভোট</p>
        </div>
      </div>
      </div>
    </footer>
  );
}
