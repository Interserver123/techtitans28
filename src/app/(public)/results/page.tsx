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
import { getLang } from "@/lib/i18n-server";
import { num, posLabel, type Lang } from "@/lib/i18n";

const STR = {
  en: {
    none: "No election has been announced yet.", eyebrow: "Public transparency dashboard", official: "Official result · Elected Class Representative",
    roll: "Roll", votes: "votes", ofValid: "of valid ballots", published: "Published", tie: "Tied result",
    tieText: (names: string, v: string) => `${names} received ${v} votes each. No winner is declared automatically.`, decision: "Committee decision:",
    cw: "Candidate-wise results", top3: "Top 3", validLine: (v: string, i: string) => `${v} valid ballots · ${i} invalidated by approved correction`,
    report: "Official result notice", reportText: "Final result notice signed by the Election Committee (memo TT-28/EC/2026/01, 25 November 2026).", download: "Download notice (PDF)",
    sealedA: "Candidate-wise results are ", sealed: "sealed", sealedClosed: " until the Election Committee verifies and publishes them.",
    sealedOpen: " until voting closes. They cannot be computed — by anyone — while the election is open.",
    part: "Participation over time", empty: "No ballots recorded yet.", partSub: "Cumulative ballots recorded, by hour (Asia/Dhaka)", voted: "Voted already?", verify: "Verify your receipt", and: " and ",
  },
  bn: {
    none: "এখনও কোনো নির্বাচন ঘোষণা করা হয়নি।", eyebrow: "জনসাধারণের স্বচ্ছতা ড্যাশবোর্ড", official: "আনুষ্ঠানিক ফলাফল · নির্বাচিত ক্লাস প্রতিনিধি",
    roll: "রোল", votes: "ভোট", ofValid: "বৈধ ব্যালটের", published: "প্রকাশিত", tie: "সমান ভোট",
    tieText: (names: string, v: string) => `${names} প্রত্যেকে ${v}টি করে ভোট পেয়েছেন। স্বয়ংক্রিয়ভাবে কোনো বিজয়ী ঘোষণা করা হয় না।`, decision: "কমিটির সিদ্ধান্ত:",
    cw: "প্রার্থীভিত্তিক ফলাফল", top3: "শীর্ষ ৩ জন", validLine: (v: string, i: string) => `${v}টি বৈধ ব্যালট · অনুমোদিত সংশোধনে ${i}টি বাতিল`,
    report: "আনুষ্ঠানিক বিজ্ঞপ্তি", reportText: "নির্বাচন কমিটি স্বাক্ষরিত চূড়ান্ত ফলাফল ঘোষণার বিজ্ঞপ্তি (স্মারক নং টিটি-২৮/নিক/২০২৬/০১, ২৫ নভেম্বর ২০২৬)।", download: "বিজ্ঞপ্তি ডাউনলোড (পিডিএফ)",
    sealedA: "প্রার্থীভিত্তিক ফলাফল ", sealed: "সিলগালা", sealedClosed: " — নির্বাচন কমিটি যাচাই করে প্রকাশ না করা পর্যন্ত।",
    sealedOpen: " — ভোটগ্রহণ শেষ না হওয়া পর্যন্ত। নির্বাচন চলাকালে কেউই তা গণনা করতে পারে না।",
    part: "সময়ের সাথে অংশগ্রহণ", empty: "এখনও কোনো ব্যালট জমা হয়নি।", partSub: "ঘণ্টাভিত্তিক মোট জমা হওয়া ব্যালট (ঢাকা সময়)", voted: "ভোট দিয়েছেন?", verify: "রসিদ যাচাই করুন", and: " ও ",
  },
} satisfies Record<Lang, unknown>;

/** Rank badges: gold, silver, bronze. */
const MEDAL: Record<number, string> = { 1: "bg-gold text-navy", 2: "bg-slate-300 text-slate-800", 3: "bg-amber-700 text-white" };

export const metadata = { title: "Results & transparency" };

export default async function ResultsPage() {
  const [election, lang] = await Promise.all([getCurrentElection(), getLang()]);
  const S = STR[lang];
  const n = (v: number | string) => num(v, lang);
  if (!election) {
    return <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted">{S.none}</div>;
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">{S.eyebrow}</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{election.title}</h1>
          <p className="mt-1 text-sm text-muted">{fmtDateTime(election.opens_at, {}, lang)} – {fmtDateTime(election.closes_at, {}, lang)}</p>
        </div>
        <StatusPill status={election.status} lang={lang} />
      </div>

      {published ? (
        <section className="mt-8 space-y-10">
          {published.positions.map((pr) => {
            const valid = pr.totals.valid_ballots;
            const title = posLabel(pr.position.gender, lang, true);
            // Top 3 by rank (candidates tied for 3rd are all shown); candidates without votes are left out.
            const top = pr.tally.filter((r) => r.rank <= 3 && r.votes > 0);
            return (
              <div key={pr.position.id}>
                <h2 className="font-display mb-4 flex items-center gap-3 text-2xl font-bold sm:text-3xl">
                  <span className="h-px w-8 bg-gold" aria-hidden />{title}
                </h2>
                {pr.outcome.kind === "WINNER" && (
                  <div className="relative overflow-hidden rounded-2xl bg-navy p-6 text-white sm:p-10">
                    <WinnerCelebration />
                    <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
                    <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
                      <div className="animate-pop relative">
                        <CandidateAvatar name={pr.outcome.winner.display_name} url={pr.outcome.winner.photo_url ?? null} className="size-32 rounded-2xl ring-4 ring-gold/70 sm:size-36" />
                        <span className="absolute -bottom-3 -right-3 flex size-11 items-center justify-center rounded-full bg-gold text-navy shadow-lg"><Trophy className="size-5" /></span>
                      </div>
                      <div className="animate-fade-up [animation-delay:250ms]">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">{S.official} · {posLabel(pr.position.gender, lang)}</p>
                        <h3 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{pr.outcome.winner.display_name}</h3>
                        <p className="mt-1 text-slate-400">{S.roll} {pr.outcome.winner.roll_number} · {n(pr.outcome.winner.votes)} {S.votes} ({S.ofValid} {n(pct(pr.outcome.winner.votes, valid))}%)</p>
                        <p className="mt-3 text-xs text-slate-500">{S.published} {fmtDateTime(published.publishedAt, {}, lang)}</p>
                      </div>
                    </div>
                  </div>
                )}
                {pr.outcome.kind === "TIE" && (
                  <Card className="border-amber-300 bg-amber-50 p-6">
                    <div className="flex gap-3"><Scale className="size-6 text-amber-700" />
                      <div>
                        <h3 className="text-xl font-bold text-amber-900">{S.tie}</h3>
                        <p className="mt-1 text-sm text-amber-900/80">{S.tieText(pr.outcome.tied.map((t) => t.display_name).join(S.and), n(pr.outcome.tied[0].votes))}</p>
                        {published.note && <p className="mt-3 rounded-lg bg-white/70 p-3 text-sm text-amber-950"><strong>{S.decision}</strong> {published.note}</p>}
                      </div>
                    </div>
                  </Card>
                )}
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>{S.top3} · {title}</CardTitle>
                    <CardDescription>{S.validLine(n(valid), n(pr.totals.invalidated_ballots))}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResultsBarChart data={top.map((r) => ({ name: r.display_name, votes: r.votes, lead: r.rank === 1 && r.votes > 0 }))} />
                    <ul className="mt-4 divide-y divide-line">
                      {top.map((r) => (
                        <li key={r.candidate_id} className="flex items-center gap-3 py-3">
                          <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${MEDAL[r.rank] ?? "bg-slate-100 text-muted"}`}>{n(r.rank)}</span>
                          <CandidateAvatar name={r.display_name} url={r.photo_url ?? null} className="size-10 rounded-full text-sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{r.display_name}</p>
                            <Progress value={pct(r.votes, valid)} className="mt-1.5 h-1.5" />
                          </div>
                          <div className="text-right tabular-nums">
                            <p className="font-bold">{n(r.votes)}</p>
                            <p className="text-xs text-muted">{n(pct(r.votes, valid))}%</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            );
          })}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6"><LiveTurnout initial={turnout} live={false} lang={lang} /></Card>
            <Card className="p-6">
              <h3 className="font-semibold">{S.report}</h3>
              <p className="mt-1 text-sm text-muted">{S.reportText}</p>
              <Button asChild className="mt-4 w-full" variant="navy"><a href="/notices/techtitans28-cr-result-notice-2026.pdf" download="techtitans28-cr-result-notice-2026.pdf"><Download /> {S.download}</a></Button>
            </Card>
          </div>
        </section>
      ) : (
        <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-6">
            <LiveTurnout initial={turnout} live={election.status === "LIVE"} lang={lang} />
            <div className="mt-6 flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <EyeOff className="size-5 shrink-0 text-muted" />
              <p>
                {S.sealedA}<strong>{S.sealed}</strong>{election.status === "CLOSED" ? S.sealedClosed : S.sealedOpen}
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{S.part}</CardTitle>
              <CardDescription>{S.partSub}</CardDescription>
            </CardHeader>
            <CardContent><ParticipationChart data={timelineData} emptyText={S.empty} /></CardContent>
          </Card>
        </section>
      )}

      {published && (
        <Card className="mt-6">
          <CardHeader><CardTitle>{S.part}</CardTitle></CardHeader>
          <CardContent><ParticipationChart data={timelineData} emptyText={S.empty} /></CardContent>
        </Card>
      )}
      <p className="mt-8 text-center text-sm text-muted">{S.voted} <Link href="/verify-receipt" className="font-medium text-electric hover:underline">{S.verify}</Link></p>
    </div>
  );
}
