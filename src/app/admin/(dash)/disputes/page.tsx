import { adminPage } from "@/lib/session";
import { listDisputes, DISPUTE_CATEGORIES } from "@/lib/services/disputes";
import { PageHeader, Empty } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { fmtDateTime } from "@/lib/format";
import { DisputeAction } from "./client";

export default async function DisputesPage() {
  const admin = await adminPage("disputes.read");
  const rows = await listDisputes();
  const tone = { OPEN: "amber", UNDER_REVIEW: "blue", RESOLVED: "green", REJECTED: "neutral" } as const;
  return (
    <div>
      <PageHeader title="Disputes & help requests" description="Reports submitted from the public help page." />
      <Alert tone="warning" className="mb-4" title="Committee-assisted process">
        Resolving a dispute never re-opens voting for a student or issues another ballot. Identity-misuse cases must be investigated in person;
        if a fraudulent ballot is confirmed after closure, use a correction request (two-person approval).
      </Alert>
      {rows.length === 0 ? <Empty>No disputes reported.</Empty> : (
        <div className="grid gap-3">
          {rows.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-sm font-semibold text-gold-300">{d.reference}</code>
                    <Badge tone={tone[d.status as keyof typeof tone] ?? "neutral"}>{d.status.replace("_", " ").toLowerCase()}</Badge>
                    <Badge tone={d.category === "IDENTITY_MISUSE" ? "red" : "neutral"}>{DISPUTE_CATEGORIES[d.category as keyof typeof DISPUTE_CATEGORIES]}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{d.description}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {d.reporter_name} · {d.reporter_contact} · Roll {d.roll_number ?? "—"}
                    {d.student_name && <> · Register: {d.student_name} · {d.has_voted ? "participation recorded" : "has not voted"}</>} · {fmtDateTime(d.created_at)}
                  </p>
                  {d.resolution_note && <p className="mt-2 text-xs text-slate-400">Decision ({d.handled_by_name}): {d.resolution_note}</p>}
                </div>
                {admin.permissions.has("disputes.manage") && !["RESOLVED", "REJECTED"].includes(d.status) && <DisputeAction id={d.id} />}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
