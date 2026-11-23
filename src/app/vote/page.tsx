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
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">ভোটার পোর্টাল</p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">{e?.title ?? "সিআর নির্বাচন"}</h1>
      {e && <p className="mt-1 text-sm text-muted">ভোটগ্রহণের সময়: {fmtDateTime(e.opens_at)} – {fmtDateTime(e.closes_at)}</p>}
      <div className="mt-8">
        {!e && <Alert tone="info" title="কোনো নির্বাচন চালু নেই">নির্বাচন কমিটি এখনো কোনো নির্বাচন শুরু করেনি।</Alert>}
        {e?.status === "PAUSED" && <Alert tone="warning" title="ভোটগ্রহণ স্থগিত">নির্বাচন কমিটি সাময়িকভাবে ভোটগ্রহণ স্থগিত রেখেছে। একটু পরে আবার চেষ্টা করুন।</Alert>}
        {e && (e.status === "CLOSED" || e.status === "RESULTS_PUBLISHED") && (
          <Card className="p-6 text-center">
            <p className="text-lg font-semibold">ভোটগ্রহণ শেষ হয়েছে</p>
            <p className="mt-1 text-sm text-muted">অংশ নেওয়া প্রত্যেক শিক্ষার্থীকে ধন্যবাদ।</p>
            <Button asChild className="mt-4" variant="navy"><Link href="/results">ফলাফল ও ভোটার উপস্থিতি দেখুন</Link></Button>
          </Card>
        )}
        {e && e.status === "SCHEDULED" && !open && (
          <Card className="p-6"><Countdown target={new Date(e.opens_at).toISOString()} serverNow={new Date().toISOString()} label="ভোটগ্রহণ শুরু হতে বাকি" /></Card>
        )}
        {open && <VoterLogin />}
      </div>
    </div>
  );
}
