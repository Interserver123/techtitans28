import { Lock } from "lucide-react";
import { adminPage } from "@/lib/session";
import { getAdminElections } from "@/lib/admin-context";
import { listCandidates } from "@/lib/services/candidates";
import { PageHeader, NoElection, Empty, ElectionStatusBadge } from "@/components/admin/ui";
import { Alert } from "@/components/ui/alert";
import { CandidateDialog, CandidateRow } from "./client";
import { BulkPhotoUpload } from "./bulk-photos";

export default async function CandidatesPage() {
  const admin = await adminPage("candidates.read");
  const { selected: e } = await getAdminElections();
  if (!e) return <><PageHeader title="প্রার্থী" /><NoElection /></>;
  const candidates = await listCandidates(e.id);
  const editable = ["DRAFT", "SCHEDULED"].includes(e.status) && admin.permissions.has("candidates.write");
  return (
    <div>
      <PageHeader
        title="প্রার্থী"
        description={<span className="inline-flex flex-wrap items-center gap-2">ক্লাস রিপ্রেজেন্টেটিভ · {e.title} <ElectionStatusBadge status={e.status} /></span>}
        actions={editable && <>
          <BulkPhotoUpload candidates={candidates.map((c) => ({ id: c.id, rollNumber: c.roll_number, displayName: c.display_name, hasPhoto: Boolean(c.photo_path) }))} />
          <CandidateDialog electionId={e.id} />
        </>}
      />
      {!["DRAFT", "SCHEDULED"].includes(e.status) && (
        <Alert tone="info" className="mb-4" title="প্রার্থী তালিকা লক করা"><span className="inline-flex items-center gap-1"><Lock className="size-3.5" /> ভোটগ্রহণ শুরু হলে ব্যালট আর বদলানো যায় না। এটি ডেটাবেস থেকেই নিয়ন্ত্রিত।</span></Alert>
      )}
      <p className="mb-4 text-sm text-slate-400">শুধু <strong className="text-slate-200">অনুমোদিত</strong> প্রার্থীরাই পাবলিক সাইট ও ব্যালটে দেখাবেন। প্রার্থীকে অবশ্যই তালিকাভুক্ত, সক্রিয় ও যোগ্য শিক্ষার্থী হতে হবে।</p>
      {candidates.length === 0 ? <Empty>এখনো কোনো প্রার্থী নেই।</Empty> : (
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
