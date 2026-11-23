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
import { getDict } from "@/lib/i18n-server";

export default async function VotePage() {
  const session = await voterFromCookies();
  if (session) redirect(session.hasVoted ? "/vote/receipt" : "/vote/ballot");
  const e = await getCurrentElection();
  const open = e ? isVotingOpen(e) : false;
  const { lang, t } = await getDict();
  const V = t.vote;
  return (
    <div className="animate-fade-up">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">{V.portal}</p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">{e?.title ?? V.fallbackTitle}</h1>
      {e && <p className="mt-1 text-sm text-muted">{V.window}: {fmtDateTime(e.opens_at, {}, lang)} – {fmtDateTime(e.closes_at, {}, lang)}</p>}
      <div className="mt-8">
        {!e && <Alert tone="info" title={V.noneTitle}>{V.noneBody}</Alert>}
        {e?.status === "PAUSED" && <Alert tone="warning" title={V.pausedTitle}>{V.pausedBody}</Alert>}
        {e && (e.status === "CLOSED" || e.status === "RESULTS_PUBLISHED") && (
          <Card className="p-6 text-center">
            <p className="text-lg font-semibold">{V.closedTitle}</p>
            <p className="mt-1 text-sm text-muted">{V.closedBody}</p>
            <Button asChild className="mt-4" variant="navy"><Link href="/results">{V.viewResults}</Link></Button>
          </Card>
        )}
        {e && e.status === "SCHEDULED" && !open && (
          <Card className="p-6"><Countdown target={new Date(e.opens_at).toISOString()} serverNow={new Date().toISOString()} label={t.hero.opensIn} lang={lang} /></Card>
        )}
        {open && <VoterLogin lang={lang} />}
      </div>
    </div>
  );
}
