import Link from "next/link";
import { AlertTriangle, Download } from "lucide-react";
import { adminPage } from "@/lib/session";
import { getAdminElections } from "@/lib/admin-context";
import { listStudents, dataQualityReport } from "@/lib/services/students";
import { getPublicSettings } from "@/lib/services/settings";
import { PageHeader } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StudentDialog, ImportDialog, ActiveToggle, StudentFilters } from "./client";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await adminPage("students.read");
  const sp = await searchParams;
  const { selected } = await getAdminElections();
  const settings = await getPublicSettings();
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = { q: sp.q?.slice(0, 60), voted: (sp.voted ?? "") as "yes" | "no" | "", status: (sp.status ?? "") as "active" | "inactive" | "ineligible" | "" };
  const { rows, total, pageSize } = await listStudents({ ...filter, page, pageSize: 25, electionId: selected?.id ?? null });
  const quality = await dataQualityReport(settings.batch);
  const canWrite = admin.permissions.has("students.write");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (p: number) => `?${new URLSearchParams({ ...(filter.q ? { q: filter.q } : {}), ...(filter.voted ? { voted: filter.voted } : {}), ...(filter.status ? { status: filter.status } : {}), page: String(p) })}`;
  const exportQs = new URLSearchParams({ ...(filter.q ? { q: filter.q } : {}), ...(filter.voted ? { voted: filter.voted } : {}), ...(filter.status ? { status: filter.status } : {}) });

  return (
    <div>
      <PageHeader
        title="Students"
        description={`Official roll register. Only active, eligible students of ${settings.batch} can vote.`}
        actions={<>
          {admin.permissions.has("students.export") && <Button asChild variant="outline" size="sm"><a href={`/api/admin/students/export?${exportQs}`}><Download /> Export CSV</a></Button>}
          {admin.permissions.has("students.import") && <ImportDialog batch={settings.batch} />}
          {canWrite && <StudentDialog batch={settings.batch} />}
        </>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[["On register", quality.counts?.total], ["Eligible voters", quality.counts?.eligible], ["Deactivated", quality.counts?.inactive], ["Ineligible", quality.counts?.ineligible], ["Dev seed records", quality.counts?.dev_seed]].map(([k, v]) => (
          <Card key={String(k)} className="px-4 py-3"><p className="text-xs text-slate-500">{k}</p><p className="text-lg font-bold text-white tabular-nums">{v ?? 0}</p></Card>
        ))}
      </div>
      {(quality.duplicateContacts.length > 0 || quality.otherBatch.length > 0 || (quality.counts?.dev_seed ?? 0) > 0) && (
        <Card className="mb-4 border-amber-500/30 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-300"><AlertTriangle className="size-4" /> Data quality</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {quality.duplicateContacts.map((d) => <li key={d.contact}>Shared contact <code className="text-amber-200">{d.contact}</code> on rolls {d.rolls.join(", ")}</li>)}
            {quality.otherBatch.length > 0 && <li>{quality.otherBatch.length} student(s) not in batch {settings.batch} (cannot vote): {quality.otherBatch.slice(0, 8).map((s) => s.roll_number).join(", ")}{quality.otherBatch.length > 8 ? "…" : ""}</li>}
            {(quality.counts?.dev_seed ?? 0) > 0 && <li>{quality.counts?.dev_seed} development seed record(s) present — remove before production.</li>}
          </ul>
        </Card>
      )}
      <Card>
        <div className="border-b border-white/[0.06] p-4"><StudentFilters initial={filter} /></div>
        <Table>
          <THead><tr><TH>Roll</TH><TH>Name</TH><TH className="hidden md:table-cell">Contact</TH><TH className="hidden sm:table-cell">Batch</TH><TH>Status</TH><TH>Voted</TH><TH className="text-right">Actions</TH></tr></THead>
          <TBody>
            {rows.length === 0 && <tr><TD colSpan={7} className="py-10 text-center text-slate-500">No students match.</TD></tr>}
            {rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-mono text-xs text-slate-200">{s.roll_number}</TD>
                <TD className="text-slate-100">{s.full_name}{s.is_dev_seed && <Badge tone="amber" className="ml-2">dev</Badge>}</TD>
                <TD className="hidden text-xs text-slate-400 md:table-cell">{s.contact_type === "EMAIL" ? "✉" : "☎"} {s.contact_value}</TD>
                <TD className="hidden text-xs text-slate-400 sm:table-cell">{s.batch}</TD>
                <TD>{!s.is_active ? <Badge tone="red">Deactivated</Badge> : !s.is_eligible ? <Badge tone="amber">Ineligible</Badge> : <Badge tone="green">Active</Badge>}</TD>
                <TD>{s.has_voted ? <Badge tone="blue">Voted</Badge> : <span className="text-xs text-slate-500">—</span>}</TD>
                <TD className="text-right">
                  {canWrite && <div className="flex justify-end gap-1">
                    <StudentDialog batch={settings.batch} student={{ id: s.id, rollNumber: s.roll_number, fullName: s.full_name, contactType: s.contact_type, contactValue: s.contact_value, batch: s.batch, isEligible: s.is_eligible, isActive: s.is_active, notes: s.notes ?? "" }} />
                    <ActiveToggle id={s.id} active={s.is_active} />
                  </div>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-sm text-slate-400">
          <span>{total} student(s)</span>
          <div className="flex gap-2">
            {page > 1 && <Button asChild size="sm" variant="outline"><Link href={qs(page - 1)}>Previous</Link></Button>}
            <span className="px-2 py-1.5">Page {page} / {pages}</span>
            {page < pages && <Button asChild size="sm" variant="outline"><Link href={qs(page + 1)}>Next</Link></Button>}
          </div>
        </div>
      </Card>
    </div>
  );
}
