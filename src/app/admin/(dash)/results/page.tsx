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
import { bnNum, fmtDateTime, pct } from "@/lib/format";
import { VerifyButton, PublishDialog } from "./client";

export default async function ResultsAdminPage() {
  const admin = await adminPage("results.view");
  const { selected: e } = await getAdminElections();
  if (!e) return <><PageHeader title="ফলাফল" /><NoElection /></>;
  if (!["CLOSED", "RESULTS_PUBLISHED"].includes(e.status)) {
    const t = await getTurnout(e);
    return (
      <div>
        <PageHeader title="ফলাফল" description={<span className="inline-flex items-center gap-2">{e.title} <ElectionStatusBadge status={e.status} /></span>} />
        <div className="mb-6 grid grid-cols-3 gap-3"><Stat label="যোগ্য" value={t.eligible} /><Stat label="ব্যালট" value={t.voted} tone="green" /><Stat label="ভোটার উপস্থিতি" value={`${bnNum(t.turnoutPct, t.turnoutPct % 1 ? 1 : 0)}%`} /></div>
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
        title="ফলাফল"
        description={<span className="inline-flex flex-wrap items-center gap-2">{e.title} <ElectionStatusBadge status={e.status} /> {r.official ? `· প্রকাশিত ${fmtDateTime(e.results_published_at)}` : "· অস্থায়ী — জনসাধারণের জন্য উন্মুক্ত নয়"}</span>}
        actions={<>
          <Button asChild size="sm" variant="outline"><a href={`/api/admin/results/${e.id}/report`}><Download /> পিডিএফ প্রতিবেদন</a></Button>
          {admin.permissions.has("ballots.read") && <Button asChild size="sm" variant="outline"><a href={`/api/admin/results/${e.id}/ledger`}><FileSpreadsheet /> ব্যালট লেজার</a></Button>}
        </>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="যোগ্য ভোটার" value={r.turnout.eligible} />
        <Stat label="ভোট পড়েছে" value={r.totals.total_ballots} tone="green" />
        <Stat label="বৈধ ব্যালট" value={r.totals.valid_ballots} />
        <Stat label="বাতিল" value={r.totals.invalidated_ballots} tone="amber" hint={`${bnNum(r.appliedCorrections)}টি অনুমোদিত সংশোধন`} />
        <Stat label="ভোটার উপস্থিতি" value={`${bnNum(r.turnout.turnoutPct, r.turnout.turnoutPct % 1 ? 1 : 0)}%`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-white">প্রার্থীভিত্তিক গণনা</CardTitle>
            <CardDescription>বৈধ ব্যালট থেকে compute_tally() দিয়ে গণনা করা</CardDescription>
          </CardHeader>
          <CardContent>
            {r.outcome.kind === "WINNER" && <div className="mb-4 flex items-center gap-3 rounded-xl bg-gold/10 p-4 ring-1 ring-gold/25"><Trophy className="size-5 text-gold-300" /><p className="text-sm text-slate-100"><strong>{r.outcome.winner.display_name}</strong> {bnNum(r.outcome.winner.votes)} ভোট পেয়ে এগিয়ে আছেন।</p></div>}
            {r.outcome.kind === "TIE" && <Alert tone="warning" className="mb-4" title="সমান ভোট">{r.outcome.tied.map((t) => t.display_name).join(", ")} প্রত্যেকে {bnNum(r.outcome.tied[0].votes)}টি করে ভোট পেয়েছেন। স্বয়ংক্রিয়ভাবে কাউকে বিজয়ী ঘোষণা করা হয় না; প্রকাশের জন্য কমিটির সমতা নিষ্পত্তির নোট লাগবে।</Alert>}
            {r.outcome.kind === "NO_VOTES" && <Alert tone="info" className="mb-4">কোনো বৈধ ভোট পড়েনি।</Alert>}
            <ResultsBarChart dark data={r.tally.map((t) => ({ name: t.display_name, votes: t.votes, lead: t.rank === 1 && t.votes > 0 }))} />
            <Table className="mt-4">
              <THead><tr><TH>অবস্থান</TH><TH>প্রার্থী</TH><TH>রোল</TH><TH className="text-right">ভোট</TH><TH className="text-right">অংশ</TH></tr></THead>
              <TBody>
                {r.tally.map((t) => (
                  <TR key={t.candidate_id}>
                    <TD className="font-bold text-slate-300">{bnNum(t.rank)}</TD>
                    <TD><span className="flex items-center gap-2 text-slate-100"><CandidateAvatar name={t.display_name} url={t.photo_url ?? null} className="size-8 rounded-full text-xs" /> {t.display_name}</span></TD>
                    <TD className="font-mono text-xs text-slate-400">{t.roll_number}</TD>
                    <TD className="text-right font-bold tabular-nums text-white">{bnNum(t.votes)}</TD>
                    <TD className="text-right tabular-nums text-slate-400">{bnNum(pct(t.votes, r.totals.valid_ballots), pct(t.votes, r.totals.valid_ballots) % 1 ? 1 : 0)}%</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="font-semibold text-white">হিসাব মিলানো</p>
            <ul className="mt-3 space-y-2 text-sm">
              <Check ok={r.totals.total_ballots === r.totals.participation}>ব্যালট ({bnNum(r.totals.total_ballots)}) = অংশগ্রহণের রেকর্ড ({bnNum(r.totals.participation)})</Check>
              <Check ok={r.reconciled}>গণনার যোগফল বৈধ ব্যালটের সমান ({bnNum(r.totals.valid_ballots)})</Check>
              <Check ok={r.pendingCorrections === 0}>{bnNum(r.pendingCorrections)}টি সংশোধনের অনুরোধ অপেক্ষমাণ</Check>
              <Check ok={r.verificationMatches}>{e.results_verified_at ? `যাচাই হয়েছে ${fmtDateTime(e.results_verified_at)}` : "এখনো যাচাই হয়নি"}{e.results_verified_at && !r.verificationMatches && " — এরপর গণনা বদলেছে"}</Check>
            </ul>
            <p className="mt-4 flex items-start gap-2 break-all text-[11px] text-slate-500"><Fingerprint className="mt-0.5 size-3.5 shrink-0" /> {r.currentHash}</p>
          </Card>
          {e.status === "CLOSED" && (
            <Card className="space-y-3 p-5">
              <p className="font-semibold text-white">প্রকাশ</p>
              <p className="text-sm text-slate-400">১. ফলাফল কর্মকর্তা মিলিয়ে দেখা গণনা যাচাই করবেন। ২. অনুমোদিত প্রকাশক অপরিবর্তনীয় অফিসিয়াল ফলাফল প্রকাশ করবেন।</p>
              {canVerify && <VerifyButton electionId={e.id} verified={r.verificationMatches} />}
              {canPublish ? <PublishDialog electionId={e.id} tie={r.outcome.kind === "TIE"} ready={r.verificationMatches && r.pendingCorrections === 0} /> : <p className="text-xs text-slate-500">আপনার ভূমিকায় ফলাফল প্রকাশের অনুমতি নেই।</p>}
            </Card>
          )}
          {r.official && e.result_note && <Card className="p-5"><p className="flex items-center gap-2 font-semibold text-white"><Scale className="size-4" /> কমিটির নোট</p><p className="mt-2 text-sm text-slate-300">{e.result_note}</p></Card>}
        </div>
      </div>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li className="flex items-start gap-2 text-slate-300">{ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-400" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />}{children}</li>;
}
