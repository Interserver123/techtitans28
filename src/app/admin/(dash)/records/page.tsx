import { FileJson, FileSpreadsheet, FileText, Fingerprint, ShieldCheck } from "lucide-react";
import { adminPage } from "@/lib/session";
import { getAdminElections } from "@/lib/admin-context";
import { one } from "@/lib/db";
import { PageHeader, NoElection } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DownloadButton } from "@/components/admin/step-up";
import { ROLE_LABELS, type Permission } from "@/lib/permissions";

/** What each role can see — the administrative side of the rules shown to voters on /terms. */
const ACCESS_RULES: { role: keyof typeof ROLE_LABELS; sees: string }[] = [
  { role: "SUPER_ADMIN", sees: "সব কিছু, ভোটারের সাথে যুক্ত ভোটসহ (কে কাকে ভোট দিয়েছেন)। ভোট সংশোধনের অনুরোধ করতে পারেন, তবে কার্যকর হতে ভিন্ন একজন সুপার অ্যাডমিনের অনুমোদন লাগে। অ্যাডমিন অ্যাকাউন্ট ও সেটিংস পরিচালনা।" },
  { role: "ELECTION_ADMIN", sees: "শিক্ষার্থী তালিকা ও কে ভোট দিয়েছেন/দেননি (অংশগ্রহণ) — কাকে ভোট দিয়েছেন তা কখনো নয়। প্রার্থী ও যোগ্যতা পরিচালনা, ভোটগ্রহণ শেষে বেনামি ব্যালট বাতিল/পুনর্বহালের অনুরোধ।" },
  { role: "RESULTS_OFFICER", sees: "ভোটগ্রহণ শেষে প্রার্থীভিত্তিক গণনা ও বেনামি ব্যালট লেজার (ব্যালট নম্বর + প্রার্থী, কোনো নাম নেই); ফলাফল যাচাই, অনুমতি থাকলে প্রকাশ।" },
  { role: "AUDITOR", sees: "শুধু-পড়া: অডিট লগ, সংশোধনের রেকর্ড, বেনামি ব্যালট লেজার ও ফলাফল। কোনো ভোটারের পছন্দ দেখতে পারেন না।" },
];

export default async function RecordsPage() {
  const admin = await adminPage("elections.read");
  const { selected: e } = await getAdminElections();
  const has = (p: Permission) => admin.permissions.has(p);
  const head = has("audit.read") ? await one<{ id: string; entry_hash: string; occurred_at: Date }>(`select id::text, entry_hash, occurred_at from audit_logs order by audit_logs.id desc limit 1`) : null;
  const closed = e ? ["CLOSED", "RESULTS_PUBLISHED"].includes(e.status) : false;

  const exports = [
    has("students.export") && e && { icon: FileSpreadsheet, title: "অংশগ্রহণ তালিকা (CSV)", body: "রোল, নাম, যোগ্যতা, ভোট দিয়েছেন কি না ও কখন। ব্যালটের বিষয়বস্তু (কাকে ভোট) এতে কখনো থাকে না।", href: "/api/admin/exports/participation", name: "participation.csv" },
    has("audit.read") && { icon: FileJson, title: "সম্পূর্ণ অডিট লগ (JSON)", body: "প্রতিটি প্রশাসনিক কাজের হ্যাশ-চেইনড রেকর্ড, হ্যাশ করা হুবহু টেক্সটসহ — ডেটাবেস ছাড়াই scripts/verify-records.mjs দিয়ে স্বাধীনভাবে যাচাইযোগ্য।", href: "/api/admin/exports/audit", name: "audit-log.json" },
    has("corrections.read") && e && { icon: FileJson, title: "সংশোধনের রেকর্ড (JSON)", body: "এই নির্বাচনের প্রতিটি সংশোধনের অনুরোধ ও সিদ্ধান্ত, প্রতিটি ধাপের অডিট এন্ট্রি এবং বেনামি ব্যালট লেজার (ভোটগ্রহণ শেষে)। কোনো ভোটারের পরিচয় থাকে না।", href: "/api/admin/exports/corrections", name: "corrections.json" },
    has("ballots.read") && e && closed && { icon: FileSpreadsheet, title: "বেনামি ব্যালট লেজার (CSV)", body: "প্রতিটি ব্যালট: নম্বর, পদ, প্রার্থী, অবস্থা ও প্রতিস্থাপনের সংযোগ। স্বাধীন পুনর্গণনার জন্য।", href: `/api/admin/results/${e.id}/ledger`, name: "ballot-ledger.csv" },
  ].filter(Boolean) as { icon: typeof FileJson; title: string; body: string; href: string; name: string }[];

  return (
    <div>
      <PageHeader title="রেকর্ড ও রপ্তানি" description="অনুমোদিত নির্বাচনী রেকর্ড রপ্তানি। প্রতিটি রপ্তানির আগে অথেনটিকেটর কোড লাগে এবং তা অডিট লগে লেখা হয়।" />
      {!e && <NoElection />}
      <div className="grid gap-3 md:grid-cols-2">
        {exports.map((x) => (
          <Card key={x.href} className="flex flex-col p-5">
            <div className="flex items-center gap-2"><x.icon className="size-4 text-gold-300" /><h2 className="font-semibold text-white">{x.title}</h2></div>
            <p className="mt-2 flex-1 text-sm text-slate-400">{x.body}</p>
            <DownloadButton className="mt-4 self-start" size="sm" variant="outline" href={x.href} fallbackName={x.name}>ডাউনলোড</DownloadButton>
          </Card>
        ))}
        {has("results.view") && e && closed && (
          <Card className="flex flex-col p-5">
            <div className="flex items-center gap-2"><FileText className="size-4 text-gold-300" /><h2 className="font-semibold text-white">ফলাফল প্রতিবেদন (PDF)</h2></div>
            <p className="mt-2 flex-1 text-sm text-slate-400">যাচাইকৃত গণনা, মিলকরণ ও যাচাই-ফিঙ্গারপ্রিন্টসহ অফিসিয়াল/অস্থায়ী প্রতিবেদন।</p>
            <Button asChild className="mt-4 self-start" size="sm" variant="outline"><a href={`/api/admin/results/${e.id}/report`}>ডাউনলোড</a></Button>
          </Card>
        )}
      </div>

      {head && (
        <Card className="mt-6 p-5">
          <div className="flex items-center gap-2"><Fingerprint className="size-4 text-gold-300" /><h2 className="font-semibold text-white">অডিট চেইনের বর্তমান শীর্ষ</h2></div>
          <p className="mt-2 text-sm text-slate-400">এন্ট্রি #{head.id}-এর হ্যাশ। গুরুত্বপূর্ণ মুহূর্তে (ভোটগ্রহণ শেষে, সংশোধনের পর, ফলাফল প্রকাশে) এটি কমিটির নোটে বা নোটিশ বোর্ডে লিখে রাখুন: পরে কেউ ডেটাবেসে পুরো চেইন নতুন করে লিখলে এই হ্যাশ আর মিলবে না।</p>
          <code className="mt-3 block break-all rounded-lg bg-white/5 p-3 font-mono text-xs text-gold-300">{head.entry_hash}</code>
        </Card>
      )}

      <Card className="mt-6 p-5">
        <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-gold-300" /><h2 className="font-semibold text-white">প্রশাসনিক প্রবেশাধিকারের নিয়ম</h2></div>
        <p className="mt-2 text-sm text-slate-400">ভোটারদের ভোট দেওয়ার আগে একই নিয়ম জানানো হয় (শর্তাবলি পাতা)। সব বিশেষাধিকারপ্রাপ্ত অ্যাকাউন্টে দুই-ধাপের যাচাই বাধ্যতামূলক; সংবেদনশীল কাজে আবার কোড লাগে।</p>
        <ul className="mt-4 space-y-3">
          {ACCESS_RULES.map((r) => (
            <li key={r.role} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <Badge tone={r.role === admin.role ? "green" : "neutral"} className="shrink-0 self-start">{ROLE_LABELS[r.role]}</Badge>
              <span className="text-sm text-slate-300">{r.sees}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">ডেটাবেস মালিকের (owner) পরিচয়পত্র যার কাছে আছে, তিনি প্রযুক্তিগতভাবে সব সংরক্ষিত তথ্য পড়তে পারেন — তাই সেটি ন্যূনতম মানুষের কাছে রাখুন। অ্যাপ্লিকেশন থেকে কোনো ব্যালট বা অডিট এন্ট্রি মোছা বা সম্পাদনা করা যায় না।</p>
      </Card>
    </div>
  );
}
