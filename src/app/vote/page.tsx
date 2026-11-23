import { redirect } from "next/navigation";
import { voterFromCookies } from "@/lib/session";
import { getCurrentElection, isVotingOpen } from "@/lib/services/elections";
import { VoterLogin } from "./voter-login";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Countdown } from "@/components/site/countdown";
import { fmtDateTime } from "@/lib/format";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function VotePage() {
  const session = await voterFromCookies();
  if (session) redirect(session.hasVoted ? "/vote/receipt" : "/vote/ballot");
  const e = await getCurrentElection();
  const open = e ? isVotingOpen(e) : false;
  return (
    <div className="animate-fade-up">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Voter portal</p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">{e?.title ?? "CR Election"}</h1>
      {e && <p className="mt-1 text-sm text-muted">Voting window: {fmtDateTime(e.opens_at)} – {fmtDateTime(e.closes_at)}</p>}
      <div className="mt-8">
        {!e && <Alert tone="info" title="No election is open">The Election Committee has not opened an election yet.</Alert>}
        {e?.status === "PAUSED" && <Alert tone="warning" title="Voting is paused">The Election Committee has temporarily paused voting. Please try again shortly.</Alert>}
        {e && (e.status === "CLOSED" || e.status === "RESULTS_PUBLISHED") && (
          <Card className="p-6 text-center">
            <p className="text-lg font-semibold">Voting has closed</p>
            <p className="mt-1 text-sm text-muted">Thank you to every student who took part.</p>
            <Button asChild className="mt-4" variant="navy"><Link href="/results">View results &amp; turnout</Link></Button>
          </Card>
        )}
        {e && e.status === "SCHEDULED" && !open && (
          <Card className="p-6"><Countdown target={new Date(e.opens_at).toISOString()} serverNow={new Date().toISOString()} label="Voting opens in" /></Card>
        )}
        {open && <VoterLogin />}
      </div>
    </div>
  );
}
