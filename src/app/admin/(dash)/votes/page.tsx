import { redirect } from "next/navigation";
import { adminPage } from "@/lib/session";
import { getCurrentElection } from "@/lib/services/elections";
import { listVoteRecords } from "@/lib/services/vote-records";
import { listApprovedCandidates, listPositions } from "@/lib/services/voting";
import { PageHeader, Empty } from "@/components/admin/ui";
import { Alert } from "@/components/ui/alert";
import { VotesTable } from "./client";

export default async function VotesPage() {
  const admin = await adminPage("admins.manage");
  if (admin.role !== "SUPER_ADMIN") redirect("/admin");
  const election = await getCurrentElection();
  if (!election) return <div><PageHeader title="ভোটের রেকর্ড" description="কে কাকে ভোট দিয়েছেন (শুধু সুপার অ্যাডমিন)।" /><Empty>কোনো নির্বাচন চালু নেই।</Empty></div>;
  let voters: Awaited<ReturnType<typeof listVoteRecords>> = [];
  let problem: string | null = null;
  try {
    voters = await listVoteRecords(admin.adminId, election.id, null);
  } catch (e) {
    problem = (e as Error).message;
  }
  const [candidates, positions] = await Promise.all([listApprovedCandidates(election.id), listPositions(election.id)]);
  const open = ["SCHEDULED", "LIVE", "PAUSED"].includes(election.status);
  return (
    <div>
      <PageHeader title="ভোটের রেকর্ড" description="কে কাকে ভোট দিয়েছেন — শুধু সুপার অ্যাডমিন দেখতে পারেন। প্রতিটি দেখা ও পরিবর্তন অডিট লগে লেখা হয়।" />
      {problem && <Alert tone="error" className="mb-4">{problem}</Alert>}
      <Alert tone="info" className="mb-4">নোটিশ চালুর আগে দেওয়া ভোট বেনামি — সেগুলো প্রার্থীর সাথে দেখানো বা পরিবর্তন করা যায় না। ভোট পরিবর্তন করলে ভোটার তার রসিদ পাতায় জানতে পারবেন।</Alert>
      <VotesTable
        electionId={election.id}
        canChange={open}
        voters={voters.map((v) => ({ ...v, votedAt: new Date(v.votedAt).toISOString(), choices: v.choices.map((c) => ({ ...c, changedAt: c.changedAt ? new Date(c.changedAt).toISOString() : null })) }))}
        positions={positions.map((p) => ({ id: p.id, code: p.code, gender: p.gender }))}
        candidates={candidates.map((c) => ({ id: c.id, positionId: c.position_id, name: c.display_name }))}
      />
    </div>
  );
}
