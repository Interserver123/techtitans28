import { redirect } from "next/navigation";
import { voterFromCookies } from "@/lib/session";
import { listApprovedCandidates } from "@/lib/services/voting";
import { getElection, isVotingOpen } from "@/lib/services/elections";
import { BallotForm } from "./ballot-form";
import { Alert } from "@/components/ui/alert";
import { getDict } from "@/lib/i18n-server";

export default async function BallotPage() {
  const s = await voterFromCookies();
  if (!s) redirect("/vote");
  if (s.hasVoted) redirect("/vote/receipt");
  const e = await getElection(s.electionId);
  const candidates = await listApprovedCandidates(s.electionId);
  const { lang, t } = await getDict();
  const B = t.ballot;
  return (
    <div className="animate-fade-up">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">{B.eyebrow}</p>
      <h1 className="font-display mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{B.title}</h1>
      <p className="mt-1 text-sm text-muted">{B.signedIn} <strong className="text-ink">{s.fullName}</strong> ({s.rollNumber}). {B.secret}</p>
      {!isVotingOpen(e) ? (
        <Alert className="mt-6" tone="warning" title={e.status === "PAUSED" ? B.pausedTitle : B.closedTitle}>{B.cannot}</Alert>
      ) : (
        <BallotForm candidates={candidates} expiresAt={new Date(s.expiresAt).toISOString()} serverNow={new Date().toISOString()} lang={lang} />
      )}
    </div>
  );
}
