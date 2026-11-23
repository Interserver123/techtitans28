import Link from "next/link";
import { adminPage, pageContext } from "@/lib/session";
import { getCurrentElection } from "@/lib/services/elections";
import { listVoteRecords } from "@/lib/services/vote-records";
import { listApprovedCandidates, listPositions } from "@/lib/services/voting";
import { AppError } from "@/lib/errors";
import { errorText } from "@/lib/i18n";
import { PageHeader, Empty } from "@/components/admin/ui";
import { Alert } from "@/components/ui/alert";
import { StepUpGate } from "@/components/admin/step-up";
import { VotesTable } from "./client";

export default async function VotesPage() {
  // votes.read arrives with migration 0009; before that a Super Admin is told to upgrade instead of "no access".
  // (The database functions re-check the Super Admin role and a fresh code either way.)
  const signedIn = await adminPage(null);
  const admin = signedIn.role === "SUPER_ADMIN" ? signedIn : await adminPage("votes.read");
  const header = <PageHeader title="ভোটের রেকর্ড" description="কে কাকে ভোট দিয়েছেন — শুধু সুপার অ্যাডমিন দেখতে পারেন। প্রতিবার দেখা অডিট লগে লেখা হয়।" />;
  const election = await getCurrentElection();
  if (!election) return <div>{header}<Empty>কোনো নির্বাচন চালু নেই।</Empty></div>;
  let voters: Awaited<ReturnType<typeof listVoteRecords>> = [];
  try {
    voters = await listVoteRecords(admin.tokenHash, election.id, (await pageContext()).ipHash);
  } catch (e) {
    if (e instanceof AppError && e.code === "STEP_UP_REQUIRED") {
      return <div>{header}<StepUpGate message="ভোটারের সাথে যুক্ত ভোট দেখতে অথেনটিকেটর কোড দিয়ে পরিচয় পুনরায় নিশ্চিত করুন। এটি অডিট লগে লেখা হবে।" /></div>;
    }
    const msg = e instanceof AppError ? errorText("bn", { code: e.code, message: e.message }) : (e as Error).message;
    return <div>{header}<Alert tone="error">{msg}</Alert></div>;
  }
  const [candidates, positions] = await Promise.all([listApprovedCandidates(election.id), listPositions(election.id)]);
  const closed = election.status === "CLOSED";
  return (
    <div>
      {header}
      <Alert tone="info" className="mb-4">
        <span>
          কোনো ভোট সরাসরি সম্পাদনা করা যায় না। ভোট সংশোধনের <strong>অনুরোধ</strong> করা যায় শুধু ভোটগ্রহণ শেষে ও ফলাফল প্রকাশের আগে, কারণসহ; তা কার্যকর হয় কেবল <strong>ভিন্ন একজন সুপার অ্যাডমিন</strong> অনুমোদন দিলে।
          মূল ব্যালট অপরিবর্তিত থাকে (বাতিল চিহ্নিত হয়) এবং তার সাথে যুক্ত একটি নতুন ব্যালট যোগ হয়; ভোটার তার রসিদ পাতায় জানতে পারেন।
          অনুরোধগুলো <Link href="/admin/corrections" className="font-semibold underline">সংশোধন</Link> পাতায় পর্যালোচনা হয়। নোটিশ চালুর আগে দেওয়া ভোট বেনামি — সেগুলো দেখা বা সংশোধন করা যায় না।
        </span>
      </Alert>
      {!closed && <Alert tone="warning" className="mb-4">নির্বাচনের অবস্থা এখন সংশোধনযোগ্য নয় — ভোটগ্রহণ শেষ হলে (এবং ফলাফল প্রকাশের আগে) সংশোধনের অনুরোধ করা যাবে।</Alert>}
      <VotesTable
        electionId={election.id}
        canRequest={closed && admin.permissions.has("corrections.create")}
        adminId={admin.adminId}
        voters={voters.map((v) => ({
          ...v, votedAt: new Date(v.votedAt).toISOString(),
          choices: v.choices.map((c) => ({ ...c, legacyChangedAt: c.legacyChangedAt ? new Date(c.legacyChangedAt).toISOString() : null })),
        }))}
        positions={positions.map((p) => ({ id: p.id, code: p.code, gender: p.gender }))}
        candidates={candidates.map((c) => ({ id: c.id, positionId: c.position_id, name: c.display_name }))}
      />
    </div>
  );
}
