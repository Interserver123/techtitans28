import { CheckCircle2, Download, FileSpreadsheet, Fingerprint, Scale, Trophy, XCircle } from "lucide-react";
import { adminPage } from "@/lib/session";
import { getAdminElections } from "@/lib/admin-context";
import { getResultSummary } from "@/lib/services/results";
import { getTurnout } from "@/lib/services/elections";
import { PageHeader, NoElection, Sealed, Stat, ElectionStatusBadge } from "@/components/admin/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ResultsBarChart } from "@/components/charts";
import { CandidateAvatar } from "@/components/site/candidate-avatar";
import { fmtDateTime, pct } from "@/lib/format";
import { VerifyButton, PublishDialog } from "./client";

export default async function ResultsAdminPage() {
  const admin = await adminPage("results.view");
  const { selected: e } = await getAdminElections();
  if (!e) return <><PageHeader title="Results" /><NoElection /></>;
  if (!["CLOSED", "RESULTS_PUBLISHED"].includes(e.status)) {
    const t = await getTurnout(e);
    return (
      <div>
        <PageHeader title="Results" description={<span className="inline-flex items-center gap-2">{e.title} <ElectionStatusBadge status={e.status} /></span>} />
        <div className="mb-6 grid grid-cols-3 gap-3"><Stat label="Eligible" value={t.eligible} /><Stat label="Ballots" value={t.voted} tone="green" /><Stat label="Turnout" value={`${t.turnoutPct}%`} /></div>
        <Sealed />
      </div>
    );
  }
  const r = await getResultSummary(e.id);
  const canVerify = admin.permissions.has("results.verify") && e.status === "CLOSED";
  const canPublish = admin.permissions.has("results.publish") && e.status === "CLOSED";
  return (
    <div>
      <PageHeader
        title="Results"
        description={<span className="inline-flex flex-wrap items-center gap-2">{e.title} <ElectionStatusBadge status={e.status} /> {r.official ? `· Published ${fmtDateTime(e.results_published_at)}` : "· Provisional — not public"}</span>}
        actions={<>
          <Button asChild size="sm" variant="outline"><a href={`/api/admin/results/${e.id}/report`}><Download /> PDF report</a></Button>
          {admin.permissions.has("ballots.read") && <Button asChild size="sm" variant="outline"><a href={`/api/admin/results/${e.id}/ledger`}><FileSpreadsheet /> Ballot ledger</a></Button>}
        </>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Eligible voters" value={r.turnout.eligible} />
        <Stat label="Ballots cast" value={r.totals.total_ballots} tone="green" />
        <Stat label="Valid ballots" value={r.totals.valid_ballots} />
        <Stat label="Invalidated" value={r.totals.invalidated_ballots} tone="amber" hint={`${r.appliedCorrections} approved correction(s)`} />
        <Stat label="Turnout" value={`${r.turnout.turnoutPct}%`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-white">Candidate-wise tally</CardTitle>
            <CardDescription>Computed from valid ballots by compute_tally()</CardDescription>
          </CardHeader>
          <CardContent>
            {r.outcome.kind === "WINNER" && <div className="mb-4 flex items-center gap-3 rounded-xl bg-electric/10 p-4 ring-1 ring-electric/25"><Trophy className="size-5 text-blue-300" /><p className="text-sm text-slate-100"><strong>{r.outcome.winner.display_name}</strong> leads with {r.outcome.winner.votes} votes.</p></div>}
            {r.outcome.kind === "TIE" && <Alert tone="warning" className="mb-4" title="Tied result">{r.outcome.tied.map((t) => t.display_name).join(", ")} have {r.outcome.tied[0].votes} votes each. No winner is declared automatically; a committee tie-resolution note is required to publish.</Alert>}
            {r.outcome.kind === "NO_VOTES" && <Alert tone="info" className="mb-4">No valid votes were cast.</Alert>}
            <ResultsBarChart dark data={r.tally.map((t) => ({ name: t.display_name, votes: t.votes, lead: t.rank === 1 && t.votes > 0 }))} />
            <Table className="mt-4">
              <THead><tr><TH>Rank</TH><TH>Candidate</TH><TH>Roll</TH><TH className="text-right">Votes</TH><TH className="text-right">Share</TH></tr></THead>
              <TBody>
                {r.tally.map((t) => (
                  <TR key={t.candidate_id}>
                    <TD className="font-bold text-slate-300">{t.rank}</TD>
                    <TD><span className="flex items-center gap-2 text-slate-100"><CandidateAvatar name={t.display_name} url={t.photo_url ?? null} className="size-8 rounded-full text-xs" /> {t.display_name}</span></TD>
                    <TD className="font-mono text-xs text-slate-400">{t.roll_number}</TD>
                    <TD className="text-right font-bold tabular-nums text-white">{t.votes}</TD>
                    <TD className="text-right tabular-nums text-slate-400">{pct(t.votes, r.totals.valid_ballots)}%</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="font-semibold text-white">Reconciliation</p>
            <ul className="mt-3 space-y-2 text-sm">
              <Check ok={r.totals.total_ballots === r.totals.participation}>Ballots ({r.totals.total_ballots}) = participation records ({r.totals.participation})</Check>
              <Check ok={r.reconciled}>Tally sum equals valid ballots ({r.totals.valid_ballots})</Check>
              <Check ok={r.pendingCorrections === 0}>{r.pendingCorrections} pending correction request(s)</Check>
              <Check ok={r.verificationMatches}>{e.results_verified_at ? `Verified ${fmtDateTime(e.results_verified_at)}` : "Not yet verified"}{e.results_verified_at && !r.verificationMatches && " — tally changed since"}</Check>
            </ul>
            <p className="mt-4 flex items-start gap-2 break-all text-[11px] text-slate-500"><Fingerprint className="mt-0.5 size-3.5 shrink-0" /> {r.currentHash}</p>
          </Card>
          {e.status === "CLOSED" && (
            <Card className="space-y-3 p-5">
              <p className="font-semibold text-white">Publication</p>
              <p className="text-sm text-slate-400">1. A results officer verifies the reconciled tally. 2. An authorised publisher publishes the immutable official result.</p>
              {canVerify && <VerifyButton electionId={e.id} verified={r.verificationMatches} />}
              {canPublish ? <PublishDialog electionId={e.id} tie={r.outcome.kind === "TIE"} ready={r.verificationMatches && r.pendingCorrections === 0} /> : <p className="text-xs text-slate-500">Your role is not authorised to publish results.</p>}
            </Card>
          )}
          {r.official && e.result_note && <Card className="p-5"><p className="flex items-center gap-2 font-semibold text-white"><Scale className="size-4" /> Committee note</p><p className="mt-2 text-sm text-slate-300">{e.result_note}</p></Card>}
        </div>
      </div>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li className="flex items-start gap-2 text-slate-300">{ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-400" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />}{children}</li>;
}
