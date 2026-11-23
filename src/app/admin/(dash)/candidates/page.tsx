import { Lock } from "lucide-react";
import { adminPage } from "@/lib/session";
import { getAdminElections } from "@/lib/admin-context";
import { listCandidates } from "@/lib/services/candidates";
import { PageHeader, NoElection, Empty, ElectionStatusBadge } from "@/components/admin/ui";
import { Alert } from "@/components/ui/alert";
import { CandidateDialog, CandidateRow } from "./client";

export default async function CandidatesPage() {
  const admin = await adminPage("candidates.read");
  const { selected: e } = await getAdminElections();
  if (!e) return <><PageHeader title="Candidates" /><NoElection /></>;
  const candidates = await listCandidates(e.id);
  const editable = ["DRAFT", "SCHEDULED"].includes(e.status) && admin.permissions.has("candidates.write");
  return (
    <div>
      <PageHeader
        title="Candidates"
        description={<span className="inline-flex flex-wrap items-center gap-2">Class Representative · {e.title} <ElectionStatusBadge status={e.status} /></span>}
        actions={editable && <CandidateDialog electionId={e.id} />}
      />
      {!["DRAFT", "SCHEDULED"].includes(e.status) && (
        <Alert tone="info" className="mb-4" title="Candidate list locked"><span className="inline-flex items-center gap-1"><Lock className="size-3.5" /> The ballot cannot change once voting has started. This is enforced by the database.</span></Alert>
      )}
      <p className="mb-4 text-sm text-slate-400">Only <strong className="text-slate-200">approved</strong> candidates appear on the public site and ballot. Candidates must be active, eligible students on the register.</p>
      {candidates.length === 0 ? <Empty>No candidates yet.</Empty> : (
        <div className="grid gap-3">
          {candidates.map((c) => (
            <CandidateRow key={c.id} editable={editable}
              c={{ id: c.id, electionId: c.election_id, rollNumber: c.roll_number, studentName: c.student_name, displayName: c.display_name, introduction: c.introduction, manifesto: c.manifesto, photoUrl: c.photo_url, status: c.status, displayOrder: c.display_order }} />
          ))}
        </div>
      )}
    </div>
  );
}
