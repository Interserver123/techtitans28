import Link from "next/link";
import { Download, EyeOff, Scale, Trophy } from "lucide-react";
import { getCurrentElection, getTurnout, participationTimeline } from "@/lib/services/elections";
import { getPublishedResults } from "@/lib/services/results";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/site/status-pill";
import { LiveTurnout } from "@/components/site/live-turnout";
import { CandidateAvatar } from "@/components/site/candidate-avatar";
import { WinnerCelebration } from "@/components/site/winner-celebration";
import { ParticipationChart, ResultsBarChart } from "@/components/charts";
import { Progress } from "@/components/ui/progress";
import { fmtDateTime, pct } from "@/lib/format";

export const metadata = { title: "Results & transparency" };

export default async function ResultsPage() {
  const election = await getCurrentElection();
  if (!election) {
    return <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted">No election has been announced yet.</div>;
  }
  const [turnout, timeline, published] = await Promise.all([
    getTurnout(election),
    participationTimeline(election.id),
    getPublishedResults(election),
  ]);
  const timelineData = timeline.map((t) => ({ bucket: new Date(t.bucket).toISOString(), votes: t.votes, cumulative: t.cumulative }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Public transparency dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{election.title}</h1>
          <p className="mt-1 text-sm text-muted">{fmtDateTime(election.opens_at)} – {fmtDateTime(election.closes_at)} (Asia/Dhaka)</p>
        </div>
        <StatusPill status={election.status} />
      </div>

      {published ? (
        <section className="mt-8">
          {published.outcome.kind === "WINNER" && (
            <div className="relative overflow-hidden rounded-2xl bg-navy p-6 text-white sm:p-10">
              <WinnerCelebration />
              <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
              <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
                <div className="animate-pop relative">
                  <CandidateAvatar name={published.outcome.winner.display_name} url={published.outcome.winner.photo_url ?? null} className="size-32 rounded-2xl ring-4 ring-electric/60 sm:size-36" />
                  <span className="absolute -bottom-3 -right-3 flex size-11 items-center justify-center rounded-full bg-electric shadow-lg"><Trophy className="size-5" /></span>
                </div>
                <div className="animate-fade-up [animation-delay:250ms]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Official result · Elected Class Representative</p>
                  <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{published.outcome.winner.display_name}</h2>
                  <p className="mt-1 text-slate-400">Roll {published.outcome.winner.roll_number} · {published.outcome.winner.votes} votes ({pct(published.outcome.winner.votes, published.totals.valid_ballots)}% of valid ballots)</p>
                  <p className="mt-3 text-xs text-slate-500">Published {fmtDateTime(published.publishedAt)}</p>
                </div>
              </div>
            </div>
          )}
          {published.outcome.kind === "TIE" && (
            <Card className="border-amber-300 bg-amber-50 p-6">
              <div className="flex gap-3"><Scale className="size-6 text-amber-700" />
                <div>
                  <h2 className="text-xl font-bold text-amber-900">Tied result</h2>
                  <p className="mt-1 text-sm text-amber-900/80">{published.outcome.tied.map((t) => t.display_name).join(" and ")} received {published.outcome.tied[0].votes} votes each. No winner is declared automatically.</p>
                  {published.note && <p className="mt-3 rounded-lg bg-white/70 p-3 text-sm text-amber-950"><strong>Committee decision:</strong> {published.note}</p>}
                </div>
              </div>
            </Card>
          )}
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <Card>
              <CardHeader>
                <CardTitle>Candidate-wise results</CardTitle>
                <CardDescription>{published.totals.valid_ballots} valid ballots · {published.totals.invalidated_ballots} invalidated by approved correction</CardDescription>
              </CardHeader>
              <CardContent>
                <ResultsBarChart data={published.rows.map((r) => ({ name: r.display_name, votes: r.votes, lead: r.is_winner || r.is_tied }))} />
                <ul className="mt-4 divide-y divide-line">
                  {published.rows.map((r) => (
                    <li key={r.candidate_id} className="flex items-center gap-3 py-3">
                      <span className="w-6 text-sm font-bold text-muted">{r.rank}</span>
                      <CandidateAvatar name={r.display_name} url={r.photo_url ?? null} className="size-10 rounded-full text-sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.display_name}</p>
                        <Progress value={pct(r.votes, published.totals.valid_ballots)} className="mt-1.5 h-1.5" />
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="font-bold">{r.votes}</p>
                        <p className="text-xs text-muted">{pct(r.votes, published.totals.valid_ballots)}%</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <div className="space-y-6">
              <Card className="p-6"><LiveTurnout initial={turnout} live={false} /></Card>
              <Card className="p-6">
                <h3 className="font-semibold">Official report</h3>
                <p className="mt-1 text-sm text-muted">Signed-off result report with participation, candidate-wise votes and the tally fingerprint.</p>
                <Button asChild className="mt-4 w-full" variant="navy"><a href="/api/public/report"><Download /> Download PDF report</a></Button>
              </Card>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-6">
            <LiveTurnout initial={turnout} live={election.status === "LIVE"} />
            <div className="mt-6 flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <EyeOff className="size-5 shrink-0 text-muted" />
              <p>
                Candidate-wise results are <strong>sealed</strong> {election.status === "CLOSED" ? "until the Election Committee verifies and publishes them." : "until voting closes. They cannot be computed — by anyone — while the election is open."}
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Participation over time</CardTitle>
              <CardDescription>Cumulative ballots recorded, by hour (Asia/Dhaka)</CardDescription>
            </CardHeader>
            <CardContent><ParticipationChart data={timelineData} /></CardContent>
          </Card>
        </section>
      )}

      {published && (
        <Card className="mt-6">
          <CardHeader><CardTitle>Participation over time</CardTitle></CardHeader>
          <CardContent><ParticipationChart data={timelineData} /></CardContent>
        </Card>
      )}
      <p className="mt-8 text-center text-sm text-muted">Voted already? <Link href="/verify-receipt" className="font-medium text-electric hover:underline">Verify your receipt</Link>.</p>
    </div>
  );
}
