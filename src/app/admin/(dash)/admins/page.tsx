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
      <PageHeader title="Administrators" description="Role-based access. MFA is mandatory for every account. Results Officers can publish only when explicitly authorised." actions={<AdminDialog />} />
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {[
          ["Super Admin", "Full configuration, election control, correction approval, publication, admin management."],
          ["Election Admin", "Students, candidates, monitoring, correction requests, disputes."],
          ["Results Officer", "Result verification; publication if authorised."],
          ["Auditor", "Read-only reports, ballot ledger and audit records."],
        ].map(([t, d]) => <Card key={t} className="p-4"><p className="text-sm font-semibold text-white">{t}</p><p className="mt-1 text-xs text-slate-400">{d}</p></Card>)}
      </div>
      <Card>
        <Table>
          <THead><tr><TH>Name</TH><TH>Role</TH><TH>MFA</TH><TH>Status</TH><TH className="hidden md:table-cell">Last sign-in</TH><TH className="text-right">Actions</TH></tr></THead>
          <TBody>
            {admins.map((a) => (
              <TR key={a.id}>
                <TD><p className="font-medium text-slate-100">{a.full_name}{a.id === me.adminId && <span className="ml-2 text-xs text-slate-500">(you)</span>}</p><p className="text-xs text-slate-500">{a.email}{a.designation ? ` · ${a.designation}` : ""}</p></TD>
                <TD><Badge tone={a.role_code === "SUPER_ADMIN" ? "violet" : "blue"}>{ROLE_LABELS[a.role_code as RoleCode]}</Badge>{a.can_publish_results && <Badge tone="green" className="ml-1">can publish</Badge>}</TD>
                <TD>{a.mfa_enabled ? <Badge tone="green">enrolled</Badge> : <Badge tone="amber">pending</Badge>}</TD>
                <TD>{!a.is_active ? <Badge tone="red">disabled</Badge> : a.locked ? <Badge tone="amber">locked</Badge> : <Badge tone="green">active</Badge>}</TD>
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
