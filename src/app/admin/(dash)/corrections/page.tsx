import { ArrowRight, Paperclip } from "lucide-react";
import { adminPage } from "@/lib/session";
import { getAdminElections } from "@/lib/admin-context";
import { listCorrections } from "@/lib/services/corrections";
import { PageHeader, NoElection, Empty, ElectionStatusBadge } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { fmtDateTime } from "@/lib/format";
import { NewCorrection, ReviewCorrection, CancelCorrection } from "./client";

export default async function CorrectionsPage() {
  const admin = await adminPage("corrections.read");
  const { selected: e } = await getAdminElections();
  if (!e) return <><PageHeader title="Corrections" /><NoElection /></>;
  const closed = ["CLOSED", "RESULTS_PUBLISHED"].includes(e.status);
  const rows = closed ? await listCorrections(e.id) : [];
  const tone = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "neutral" } as const;
  return (
    <div>
      <PageHeader
        title="Vote corrections"
        description={<span className="inline-flex flex-wrap items-center gap-2">Two-person rule: every correction needs a reason and approval by a different authorised administrator. Ballots are never edited or deleted. <ElectionStatusBadge status={e.status} /></span>}
        actions={admin.permissions.has("corrections.create") && e.status === "CLOSED" && <NewCorrection electionId={e.id} />}
      />
      {!closed && <Alert tone="info" className="mb-4">Corrections can be requested once the election has closed (the anonymous ballot ledger is sealed while voting is open).</Alert>}
      {e.status === "RESULTS_PUBLISHED" && <Alert tone="info" className="mb-4">Results are published and immutable; no further corrections can be applied.</Alert>}
      {closed && rows.length === 0 && <Empty>No correction requests for this election.</Empty>}
      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone[r.status]}>{r.status.toLowerCase()}</Badge>
                  <span className="font-semibold text-white">{r.correction === "INVALIDATE_BALLOT" ? "Invalidate ballot" : "Reinstate ballot"}</span>
                  <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-blue-300">{r.ballot_ref}</code>
                  <span className="text-xs text-slate-500">current: {r.ballot_status.toLowerCase()}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{r.reason}</p>
                {r.evidence_note && <p className="mt-1 text-sm text-slate-400">Evidence: {r.evidence_note}</p>}
                {r.evidence_path && <a className="mt-1 inline-flex items-center gap-1 text-xs text-blue-400 hover:underline" href={`/api/admin/corrections/${r.id}/evidence`}><Paperclip className="size-3" /> Download attachment</a>}
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  Requested by <span className="text-slate-300">{r.requester_name}</span> · {fmtDateTime(r.requested_at)}
                  {r.reviewed_by && <><ArrowRight className="size-3" /> {r.status.toLowerCase()} by <span className="text-slate-300">{r.reviewer_name}</span> · {fmtDateTime(r.reviewed_at)}</>}
                </p>
                {r.review_note && <p className="mt-1 text-xs text-slate-400">Review note: {r.review_note}</p>}
              </div>
              {r.status === "PENDING" && e.status === "CLOSED" && (
                <div className="flex shrink-0 gap-2">
                  {admin.permissions.has("corrections.review") && r.requested_by !== admin.adminId && <ReviewCorrection id={r.id} />}
                  {r.requested_by === admin.adminId && <CancelCorrection id={r.id} />}
                  {admin.permissions.has("corrections.review") && r.requested_by === admin.adminId && <span className="self-center text-xs text-slate-500">Awaiting a second administrator</span>}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
