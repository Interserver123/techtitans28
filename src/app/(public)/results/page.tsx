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
import { bn, bnNum, fmtDateTime, pct } from "@/lib/format";

const p1 = (n: number) => bnNum(n, n % 1 ? 1 : 0);

export const metadata = { title: "ফলাফল ও স্বচ্ছতা" };

export default async function ResultsPage() {
  const election = await getCurrentElection();
  if (!election) {
    return <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted">এখনো কোনো নির্বাচন ঘোষণা করা হয়নি।</div>;
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">জনসাধারণের জন্য স্বচ্ছতা ড্যাশবোর্ড</p>
          <h1 className="font-display mt-2 text-3xl font-bold sm:text-4xl">{election.title}</h1>
          <p className="mt-1 text-sm text-muted">{fmtDateTime(election.opens_at)} – {fmtDateTime(election.closes_at)} (বাংলাদেশ সময়)</p>
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
                  <CandidateAvatar name={published.outcome.winner.display_name} url={published.outcome.winner.photo_url ?? null} className="size-32 rounded-2xl ring-4 ring-gold/70 sm:size-36" />
                  <span className="absolute -bottom-3 -right-3 flex size-11 items-center justify-center rounded-full bg-gold text-navy shadow-lg"><Trophy className="size-5" /></span>
                </div>
                <div className="animate-fade-up [animation-delay:250ms]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">অফিসিয়াল ফলাফল · নির্বাচিত ক্লাস রিপ্রেজেন্টেটিভ</p>
                  <h2 className="font-display mt-2 text-3xl font-bold sm:text-4xl">{published.outcome.winner.display_name}</h2>
                  <p className="mt-1 text-slate-400">রোল {bn(published.outcome.winner.roll_number)} · {bnNum(published.outcome.winner.votes)} ভোট (বৈধ ব্যালটের {p1(pct(published.outcome.winner.votes, published.totals.valid_ballots))}%)</p>
                  <p className="mt-3 text-xs text-slate-500">প্রকাশিত: {fmtDateTime(published.publishedAt)}</p>
                </div>
              </div>
            </div>
          )}
          {published.outcome.kind === "TIE" && (
            <Card className="border-amber-300 bg-amber-50 p-6">
              <div className="flex gap-3"><Scale className="size-6 text-amber-700" />
                <div>
                  <h2 className="text-xl font-bold text-amber-900">সমান ভোট</h2>
                  <p className="mt-1 text-sm text-amber-900/80">{published.outcome.tied.map((t) => t.display_name).join(" ও ")} প্রত্যেকে {bnNum(published.outcome.tied[0].votes)}টি করে ভোট পেয়েছেন। স্বয়ংক্রিয়ভাবে কাউকে বিজয়ী ঘোষণা করা হয় না।</p>
                  {published.note && <p className="mt-3 rounded-lg bg-white/70 p-3 text-sm text-amber-950"><strong>কমিটির সিদ্ধান্ত:</strong> {published.note}</p>}
                </div>
              </div>
            </Card>
          )}
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <Card>
              <CardHeader>
                <CardTitle>প্রার্থীভিত্তিক ফলাফল</CardTitle>
                <CardDescription>{bnNum(published.totals.valid_ballots)}টি বৈধ ব্যালট · অনুমোদিত সংশোধনে {bnNum(published.totals.invalidated_ballots)}টি বাতিল</CardDescription>
              </CardHeader>
              <CardContent>
                <ResultsBarChart data={published.rows.map((r) => ({ name: r.display_name, votes: r.votes, lead: r.is_winner || r.is_tied }))} />
                <ul className="mt-4 divide-y divide-line">
                  {published.rows.map((r) => (
                    <li key={r.candidate_id} className="flex items-center gap-3 py-3">
                      <span className="w-6 text-sm font-bold text-muted">{bn(r.rank)}</span>
                      <CandidateAvatar name={r.display_name} url={r.photo_url ?? null} className="size-10 rounded-full text-sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.display_name}</p>
                        <Progress value={pct(r.votes, published.totals.valid_ballots)} className="mt-1.5 h-1.5" />
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="font-bold">{bnNum(r.votes)}</p>
                        <p className="text-xs text-muted">{p1(pct(r.votes, published.totals.valid_ballots))}%</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <div className="space-y-6">
              <Card className="p-6"><LiveTurnout initial={turnout} live={false} /></Card>
              <Card className="p-6">
                <h3 className="font-semibold">অফিসিয়াল প্রতিবেদন</h3>
                <p className="mt-1 text-sm text-muted">ভোটার উপস্থিতি, প্রার্থীভিত্তিক ভোট ও গণনার ফিঙ্গারপ্রিন্টসহ চূড়ান্ত ফলাফল প্রতিবেদন।</p>
                <Button asChild className="mt-4 w-full" variant="navy"><a href="/api/public/report"><Download /> পিডিএফ প্রতিবেদন ডাউনলোড করুন</a></Button>
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
                {election.status === "CLOSED" ? <>নির্বাচন কমিটি যাচাই করে প্রকাশ না করা পর্যন্ত প্রার্থীভিত্তিক ফলাফল <strong>সিলগালা</strong> থাকবে।</> : <>ভোটগ্রহণ শেষ না হওয়া পর্যন্ত প্রার্থীভিত্তিক ফলাফল <strong>সিলগালা</strong> থাকবে। নির্বাচন চলাকালীন কেউই — অ্যাডমিনও না — তা গণনা করতে পারেন না।</>}
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>সময়ের সাথে অংশগ্রহণ</CardTitle>
              <CardDescription>ঘণ্টাভিত্তিক মোট জমা পড়া ব্যালট (বাংলাদেশ সময়)</CardDescription>
            </CardHeader>
            <CardContent><ParticipationChart data={timelineData} /></CardContent>
          </Card>
        </section>
      )}

      {published && (
        <Card className="mt-6">
          <CardHeader><CardTitle>সময়ের সাথে অংশগ্রহণ</CardTitle></CardHeader>
          <CardContent><ParticipationChart data={timelineData} /></CardContent>
        </Card>
      )}
      <p className="mt-8 text-center text-sm text-muted">ভোট দিয়ে ফেলেছেন? <Link href="/verify-receipt" className="font-medium text-electric hover:underline">আপনার রসিদ যাচাই করুন</Link>।</p>
    </div>
  );
}
