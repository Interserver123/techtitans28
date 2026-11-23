import { adminPage } from "@/lib/session";
import { listAdmins } from "@/lib/services/admins";
import { PageHeader } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { AdminDialog, AdminActions } from "./client";

export default async function AdminsPage() {
  const me = await adminPage("admins.manage");
  const admins = await listAdmins();
  return (
    <div>
      <PageHeader title="অ্যাডমিন" description="ভূমিকাভিত্তিক প্রবেশাধিকার। প্রতিটি অ্যাকাউন্টে দুই-ধাপের যাচাই বাধ্যতামূলক। ফলাফল কর্মকর্তা শুধু সুনির্দিষ্ট অনুমতি পেলেই ফলাফল প্রকাশ করতে পারেন।" actions={<AdminDialog />} />
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {[
          ["সুপার অ্যাডমিন", "সম্পূর্ণ কনফিগারেশন, নির্বাচন নিয়ন্ত্রণ, সংশোধন অনুমোদন, ফলাফল প্রকাশ ও অ্যাডমিন ব্যবস্থাপনা।"],
          ["নির্বাচন অ্যাডমিন", "শিক্ষার্থী, প্রার্থী, পর্যবেক্ষণ, সংশোধনের অনুরোধ ও অভিযোগ।"],
          ["ফলাফল কর্মকর্তা", "ফলাফল যাচাই; অনুমতি থাকলে প্রকাশ।"],
          ["নিরীক্ষক", "শুধু পড়ার অনুমতি: প্রতিবেদন, ব্যালট লেজার ও অডিট রেকর্ড।"],
        ].map(([t, d]) => <Card key={t} className="p-4"><p className="text-sm font-semibold text-white">{t}</p><p className="mt-1 text-xs text-slate-400">{d}</p></Card>)}
      </div>
      <Card>
        <Table>
          <THead><tr><TH>নাম</TH><TH>ভূমিকা</TH><TH>দুই-ধাপ</TH><TH>অবস্থা</TH><TH className="hidden md:table-cell">সর্বশেষ লগইন</TH><TH className="text-right">কার্যক্রম</TH></tr></THead>
          <TBody>
            {admins.map((a) => (
              <TR key={a.id}>
                <TD><p className="font-medium text-slate-100">{a.full_name}{a.id === me.adminId && <span className="ml-2 text-xs text-slate-500">(আপনি)</span>}</p><p className="text-xs text-slate-500">{a.email}{a.designation ? ` · ${a.designation}` : ""}</p></TD>
                <TD><Badge tone={a.role_code === "SUPER_ADMIN" ? "violet" : "blue"}>{ROLE_LABELS[a.role_code as RoleCode]}</Badge>{a.can_publish_results && <Badge tone="green" className="ml-1">প্রকাশ করতে পারেন</Badge>}</TD>
                <TD>{a.mfa_enabled ? <Badge tone="green">চালু</Badge> : <Badge tone="amber">বাকি</Badge>}</TD>
                <TD>{!a.is_active ? <Badge tone="red">নিষ্ক্রিয়</Badge> : a.locked ? <Badge tone="amber">লক করা</Badge> : <Badge tone="green">সক্রিয়</Badge>}</TD>
                <TD className="hidden text-xs text-slate-400 md:table-cell">{fmtDateTime(a.last_login_at)}</TD>
                <TD className="text-right">{a.id !== me.adminId && <AdminActions admin={{ id: a.id, fullName: a.full_name, designation: a.designation ?? "", role: a.role_code, canPublishResults: a.can_publish_results, isActive: a.is_active }} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
