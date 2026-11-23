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
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Official ballot · Class Representative</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Choose one candidate</h1>
      <p className="mt-1 text-sm text-muted">Signed in as <strong className="text-ink">{s.fullName}</strong> ({s.rollNumber}). Your choice is secret.</p>
      {!isVotingOpen(e) ? (
        <Alert className="mt-6" tone="warning" title={e.status === "PAUSED" ? "Voting is paused" : "Voting is not open"}>Your ballot cannot be submitted right now.</Alert>
      ) : (
        <BallotForm candidates={candidates} expiresAt={new Date(s.expiresAt).toISOString()} serverNow={new Date().toISOString()} />
      )}
    </div>
  );
}
