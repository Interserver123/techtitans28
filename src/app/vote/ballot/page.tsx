import { redirect } from "next/navigation";
import { voterFromCookies } from "@/lib/session";
import { listApprovedCandidates } from "@/lib/services/voting";
import { getElection, isVotingOpen } from "@/lib/services/elections";
import { BallotForm } from "./ballot-form";
import { Alert } from "@/components/ui/alert";

export default async function BallotPage() {
  const s = await voterFromCookies();
  if (!s) redirect("/vote");
  if (s.hasVoted) redirect("/vote/receipt");
  const e = await getElection(s.electionId);
  const candidates = await listApprovedCandidates(s.electionId);
  return (
    <div className="animate-fade-up">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">অফিসিয়াল ব্যালট · ক্লাস রিপ্রেজেন্টেটিভ</p>
      <h1 className="font-display mt-2 text-2xl font-bold tracking-tight sm:text-3xl">একজন প্রার্থী বেছে নিন</h1>
      <p className="mt-1 text-sm text-muted">লগইন করেছেন <strong className="text-ink">{s.fullName}</strong> ({s.rollNumber}) হিসেবে। আপনার পছন্দ সম্পূর্ণ গোপন।</p>
      {!isVotingOpen(e) ? (
        <Alert className="mt-6" tone="warning" title={e.status === "PAUSED" ? "ভোটগ্রহণ স্থগিত" : "ভোটগ্রহণ চালু নেই"}>এই মুহূর্তে আপনার ব্যালট জমা দেওয়া যাবে না।</Alert>
      ) : (
        <BallotForm candidates={candidates} expiresAt={new Date(s.expiresAt).toISOString()} serverNow={new Date().toISOString()} />
      )}
    </div>
  );
}
