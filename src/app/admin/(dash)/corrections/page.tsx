import { ArrowRight, Paperclip } from "lucide-react";
import { adminPage } from "@/lib/session";
import { getAdminElections } from "@/lib/admin-context";
import { correctionSubjects, listCorrections } from "@/lib/services/corrections";
import { PageHeader, NoElection, Empty, ElectionStatusBadge } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { fmtDateTime } from "@/lib/format";
import { NewCorrection, ReviewCorrection, CancelCorrection } from "./client";

const STATUS_BN: Record<string, string> = { PENDING: "অপেক্ষমাণ", APPROVED: "অনুমোদিত", REJECTED: "প্রত্যাখ্যাত", CANCELLED: "প্রত্যাহৃত" };
const KIND_BN: Record<string, string> = { INVALIDATE_BALLOT: "ব্যালট বাতিল", REINSTATE_BALLOT: "ব্যালট পুনর্বহাল", REPLACE_CHOICE: "ভোট সংশোধন (প্রার্থী পরিবর্তন)" };

export default async function CorrectionsPage() {
  const admin = await adminPage("corrections.read");
  const { selected: e } = await getAdminElections();
  if (!e) return <><PageHeader title="সংশোধন" /><NoElection /></>;
  const closed = ["CLOSED", "RESULTS_PUBLISHED"].includes(e.status);
  const rows = closed ? await listCorrections(e.id) : [];
  // Which voter a vote change concerns: only Super Admins (who can already see voter-linked votes).
  const subjects = closed && admin.permissions.has("votes.read") ? await correctionSubjects(admin.tokenHash, e.id) : null;
  const isSuper = admin.role === "SUPER_ADMIN";
  const tone = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "neutral" } as const;
  return (
    <div>
      <PageHeader
        title="ভোট সংশোধন"
        description={<span className="inline-flex flex-wrap items-center gap-2">দুইজনের নিয়ম: প্রতিটি সংশোধনের জন্য কারণ এবং ভিন্ন একজন অনুমোদিত অ্যাডমিনের সম্মতি লাগে (ভোট সংশোধনে দ্বিতীয় একজন সুপার অ্যাডমিন)। ব্যালট কখনো সম্পাদনা বা মুছে ফেলা হয় না — মূল ব্যালট ও সম্পূর্ণ ইতিহাস সংরক্ষিত থাকে। <ElectionStatusBadge status={e.status} /></span>}
        actions={admin.permissions.has("corrections.create") && e.status === "CLOSED" && <NewCorrection electionId={e.id} />}
      />
      {!closed && <Alert tone="info" className="mb-4">নির্বাচন শেষ হওয়ার পরই সংশোধনের অনুরোধ করা যাবে (ভোটগ্রহণ চলাকালীন বেনামি ব্যালট লেজার সিলগালা থাকে)।</Alert>}
      {e.status === "RESULTS_PUBLISHED" && <Alert tone="info" className="mb-4">ফলাফল প্রকাশিত ও অপরিবর্তনীয়; আর কোনো সংশোধন কার্যকর করা যাবে না।</Alert>}
      {closed && rows.length === 0 && <Empty>এই নির্বাচনে কোনো সংশোধনের অনুরোধ নেই।</Empty>}
      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone[r.status]}>{STATUS_BN[r.status]}</Badge>
                  <span className="font-semibold text-white">{KIND_BN[r.correction] ?? r.correction}</span>
                  <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-gold-300">{r.ballot_ref}</code>
                  <span className="text-xs text-slate-500">বর্তমান: {r.ballot_status === "VALID" ? "বৈধ" : "বাতিল"}{r.replaced ? " · প্রতিস্থাপিত" : ""}</span>
                </div>
                {r.correction === "REPLACE_CHOICE" && (
                  <p className="mt-2 text-sm text-slate-200">
                    {r.from_candidate} <ArrowRight className="inline size-3.5" /> <strong>{r.to_candidate}</strong>
                    {r.replacement_ref && <span className="ml-2 text-xs text-slate-400">নতুন ব্যালট <code className="text-gold-300">{r.replacement_ref}</code> (মূলটি বাতিল চিহ্নিত, মুছে ফেলা হয়নি)</span>}
                  </p>
                )}
                {subjects?.get(r.id) && <p className="mt-1 text-xs text-amber-300">ভোটার (শুধু সুপার অ্যাডমিন দেখেন): {subjects.get(r.id)!.name} · রোল {subjects.get(r.id)!.roll}</p>}
                <p className="mt-2 text-sm text-slate-300">{r.reason}</p>
                {r.evidence_note && <p className="mt-1 text-sm text-slate-400">প্রমাণ: {r.evidence_note}</p>}
                {r.evidence_path && <a className="mt-1 inline-flex items-center gap-1 text-xs text-gold hover:underline" href={`/api/admin/corrections/${r.id}/evidence`}><Paperclip className="size-3" /> সংযুক্তি ডাউনলোড</a>}
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  অনুরোধকারী <span className="text-slate-300">{r.requester_name}</span> · {fmtDateTime(r.requested_at)}
                  {r.reviewed_by && <><ArrowRight className="size-3" /> <span className="text-slate-300">{r.reviewer_name}</span> কর্তৃক {STATUS_BN[r.status]} · {fmtDateTime(r.reviewed_at)}</>}
                </p>
                {r.review_note && <p className="mt-1 text-xs text-slate-400">পর্যালোচনার নোট: {r.review_note}</p>}
              </div>
              {r.status === "PENDING" && e.status === "CLOSED" && (
                <div className="flex shrink-0 gap-2">
                  {admin.permissions.has("corrections.review") && r.requested_by !== admin.adminId && (r.correction !== "REPLACE_CHOICE" || isSuper) && <ReviewCorrection id={r.id} kind={r.correction} />}
                  {r.requested_by === admin.adminId && <CancelCorrection id={r.id} />}
                  {admin.permissions.has("corrections.review") && r.requested_by === admin.adminId && <span className="self-center text-xs text-slate-500">{r.correction === "REPLACE_CHOICE" ? "দ্বিতীয় একজন সুপার অ্যাডমিনের অপেক্ষায়" : "দ্বিতীয় একজন অ্যাডমিনের অপেক্ষায়"}</span>}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
