import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { adminPage } from "@/lib/session";
import { listAudit, listAuditActors, verifyAuditChain } from "@/lib/services/audit-read";
import { PageHeader } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { bnNum, fmtDateTime } from "@/lib/format";
import { AuditFilter } from "./client";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; actor?: string; before?: string }> }) {
  await adminPage("audit.read");
  const sp = await searchParams;
  const action = sp.action && /^[A-Z][A-Z0-9_.]{0,63}$/.test(sp.action) ? sp.action : undefined;
  const before = sp.before && /^\d+$/.test(sp.before) ? Number(sp.before) : undefined;
  const actor = sp.actor && /^[0-9a-f-]{36}$/i.test(sp.actor) ? sp.actor : undefined;
  const [rows, chain, actors] = await Promise.all([listAudit({ action, actor, before, limit: 100 }), verifyAuditChain(), listAuditActors()]);
  const last = rows.at(-1)?.id;
  return (
    <div>
      <PageHeader title="অডিট লগ" description="প্রতিটি বিশেষাধিকারপ্রাপ্ত কাজের শুধু-সংযোজনযোগ্য, হ্যাশ-চেইনড রেকর্ড (প্রশাসনিক কার্যকলাপের লগ)। অ্যাপ্লিকেশন থেকে এটি সম্পাদনা বা মোছা যায় না; 'রেকর্ড ও রপ্তানি' পাতা থেকে স্বাধীন যাচাইয়ের জন্য রপ্তানি করুন।" />
      <Card className={`mb-4 flex items-center gap-3 p-4 ${chain.ok ? "border-green-500/25" : "border-red-500/40"}`}>
        {chain.ok ? <ShieldCheck className="size-5 text-green-400" /> : <ShieldAlert className="size-5 text-red-400" />}
        <p className="text-sm text-slate-200">
          {chain.ok ? <>হ্যাশ চেইন অক্ষত · {bnNum(Number(chain.entries))}টি এন্ট্রি যাচাই করা হয়েছে</> : <>এন্ট্রি #{bnNum(Number(chain.first_broken_id))}-এ হ্যাশ চেইন ভাঙা — অ্যাপ্লিকেশনের বাইরে থেকে অডিট লগে কারচুপি করা হয়েছে।</>}
        </p>
      </Card>
      <Card>
        <div className="border-b border-white/[0.06] p-4"><AuditFilter initial={action ?? ""} actor={actor ?? ""} actors={actors.map((a) => ({ id: a.id, name: a.full_name }))} /></div>
        <Table>
          <THead><tr><TH>#</TH><TH>সময়</TH><TH>কর্তা</TH><TH>কাজ</TH><TH className="hidden md:table-cell">বিষয়</TH><TH className="hidden lg:table-cell">বিস্তারিত</TH></tr></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs text-slate-500">{r.id}</TD>
                <TD className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(r.occurred_at, { second: "2-digit" })}</TD>
                <TD className="text-xs text-slate-300">{r.actor_label ?? ({ ADMIN: "অ্যাডমিন", VOTER: "ভোটার", SYSTEM: "সিস্টেম" } as Record<string, string>)[r.actor_type] ?? r.actor_type}</TD>
                <TD><code className="text-xs text-gold-300">{r.action}</code></TD>
                <TD className="hidden text-xs text-slate-400 md:table-cell">{r.entity_type}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}</TD>
                <TD className="hidden max-w-md truncate font-mono text-[11px] text-slate-500 lg:table-cell" title={JSON.stringify(r.details)}>{JSON.stringify(r.details)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 100 && last && (
          <div className="border-t border-white/[0.06] p-3 text-right"><Button asChild size="sm" variant="outline"><Link href={`?${new URLSearchParams({ ...(action ? { action } : {}), ...(actor ? { actor } : {}), before: last })}`}>পুরোনো এন্ট্রি</Link></Button></div>
        )}
      </Card>
    </div>
  );
}
