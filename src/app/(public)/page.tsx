import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, ChevronDown, EyeOff, FileClock, Fingerprint, Gavel, KeyRound, LifeBuoy, Lock, Mail, MapPin,
  Phone, ReceiptText, ShieldCheck, Smartphone, Trophy, Users, Vote, Zap,
} from "lucide-react";
import { getPublicState } from "@/lib/services/public";
import { Countdown } from "@/components/site/countdown";
import { LiveTurnout } from "@/components/site/live-turnout";
import { StatusPill } from "@/components/site/status-pill";
import { CandidateAvatar } from "@/components/site/candidate-avatar";
import { SpotlightCard } from "@/components/site/spotlight-card";
import { AnimatedNumber } from "@/components/site/animated-number";
import { Marquee } from "@/components/site/marquee";
import { Button } from "@/components/ui/button";
import { fmtDateTime, STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const { election, settings, turnout, candidates, votingOpen, serverNow } = await getPublicState();
  const status = election?.status ?? null;
  const countdown =
    election && status === "SCHEDULED" && new Date(election.opens_at) > new Date()
      ? { target: new Date(election.opens_at).toISOString(), label: "Voting opens in" }
      : election && (status === "LIVE" || status === "PAUSED" || status === "SCHEDULED")
        ? { target: new Date(election.closes_at).toISOString(), label: "Voting closes in" }
        : null;

  const order = ["DRAFT", "SCHEDULED", "LIVE", "CLOSED", "RESULTS_PUBLISHED"];
  const at = status === "PAUSED" ? 2 : Math.max(0, order.indexOf(status ?? "DRAFT"));
  const timeline = [
    { t: "Candidates announced", d: `${candidates.length} approved candidate${candidates.length === 1 ? "" : "s"} for Class Representative`, when: null as string | null, icon: Users },
    { t: "Voting opens", d: "Verified students cast one secret ballot", when: election ? fmtDateTime(election.opens_at) : "To be announced", icon: Zap },
    { t: "Voting closes", d: "Ballots sealed; no further votes accepted", when: election ? fmtDateTime(election.closes_at) : "To be announced", icon: Lock },
    { t: "Result verification", d: "Tally reconciled and verified by the Results Officer", when: election?.results_verified_at ? fmtDateTime(election.results_verified_at) : null, icon: Gavel },
    { t: "Official result", d: "Published with a downloadable report", when: election?.results_published_at ? fmtDateTime(election.results_published_at) : null, icon: Trophy },
  ];
  const progress = [1, 2, 3, 3, 4][Math.min(at, 4)];
  const stateIndex = status === "RESULTS_PUBLISHED" ? 4 : status === "CLOSED" ? (election?.results_verified_at ? 3 : 2) : status === "LIVE" || status === "PAUSED" ? 1 : 0;
  void progress;

  return (
    <>
      {/* ───────────── HERO ───────────── */}
      <section className="noise relative isolate overflow-hidden bg-navy text-white">
        <div className="aurora" aria-hidden><i /></div>
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_72%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-14 px-4 pb-20 pt-12 sm:px-6 md:pb-28 md:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="animate-fade-up">
            <div className="border-shimmer inline-flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4 text-xs font-medium text-slate-200">
              <StatusPill status={status} className="bg-white/10 py-0.5 text-white ring-white/15" />
              <span className="text-slate-400">{settings.institution}</span>
            </div>
            <h1 className="mt-7 text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl">
              Your batch.<br />
              Your voice.<br />
              <span className="text-gradient">CR Election 2026</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              {election?.description?.trim() ||
                `Choose the Class Representative who will speak for ${settings.batch}. One verified student, one secret ballot — sealed, audited and transparent.`}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl" className="group relative overflow-hidden bg-gradient-to-r from-electric to-indigo-500 shadow-glow hover:brightness-110">
                <Link href="/vote">
                  <Vote /> {votingOpen ? "Start voting" : "Open voter portal"}
                  <ArrowRight className="transition group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="border-white/15 bg-white/5 text-white backdrop-blur hover:bg-white/10">
                <Link href={status === "RESULTS_PUBLISHED" ? "/results" : "#candidates"}>
                  {status === "RESULTS_PUBLISHED" ? <><Trophy /> Official results</> : <><Users /> Meet the candidates</>}
                </Link>
              </Button>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-slate-400">
              {[[ShieldCheck, "OTP-verified voters"], [EyeOff, "Secret ballot"], [FileClock, "Tamper-evident audit log"]].map(([Icon, label]) => {
                const I = Icon as typeof ShieldCheck;
                return <li key={label as string} className="flex items-center gap-2"><I className="size-4 text-blue-300" />{label as string}</li>;
              })}
            </ul>
          </div>

          <div className="relative animate-fade-up [animation-delay:150ms]">
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-electric/30 via-indigo-500/10 to-transparent blur-2xl" aria-hidden />
            <div className="glass rounded-3xl p-6 sm:p-7">
              {countdown ? (
                <Countdown target={countdown.target} serverNow={serverNow} label={countdown.label} dark />
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/80">Election status</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight">{status ? STATUS_LABEL[status] : "Not yet announced"}</p>
                  <p className="mt-1.5 text-sm text-slate-400">
                    {status === "RESULTS_PUBLISHED" ? "The official result has been published by the Election Committee." : status === "CLOSED" ? "Voting has ended. Results are published after verification." : "The Election Committee will announce the schedule here."}
                  </p>
                </div>
              )}
              {status === "PAUSED" && <p className="mt-4 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-200">Voting is temporarily paused by the Election Committee.</p>}
              {turnout && (
                <div className="mt-6 border-t border-white/10 pt-5">
                  <LiveTurnout initial={turnout} live={status === "LIVE"} dark />
                </div>
              )}
            </div>
            <div className="glass absolute -bottom-9 -left-4 hidden animate-float items-center gap-2.5 rounded-2xl px-4 py-3 text-xs font-medium text-slate-200 sm:flex">
              <span className="flex size-8 items-center justify-center rounded-full bg-green-500/20"><BadgeCheck className="size-4 text-green-400" /></span>
              One ballot per student
            </div>
            <div className="glass absolute -right-3 -top-5 hidden animate-float-slow items-center gap-2.5 rounded-2xl px-4 py-3 text-xs font-medium text-slate-200 sm:flex">
              <span className="flex size-8 items-center justify-center rounded-full bg-blue-500/20"><Lock className="size-4 text-blue-300" /></span>
              Results sealed until close
            </div>
          </div>
        </div>
        <div className="hairline-gold" aria-hidden />
      </section>

      {/* ───────────── TRUST MARQUEE ───────────── */}
      <div className="border-b border-line bg-surface py-5">
        <Marquee
          className="text-sm font-medium text-slate-500"
          items={[
            "Islamic University, Bangladesh", "Department of ICT", `${settings.batch}`, "One student · one ballot", "Secret & verifiable", "Sealed until close",
            "Mobile-first voting", "Hash-chained audit trail", "Independent Election Committee",
          ].map((t) => <><span className="size-1.5 rotate-45 bg-gold" />{t}</>)}
        />
      </div>

      {/* ───────────── LIVE STATS ───────────── */}
      {turnout && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-label="Election at a glance">
          <div className="reveal grid gap-px overflow-hidden rounded-3xl border border-line bg-line shadow-elite sm:grid-cols-4">
            {[
              { k: "Eligible voters", v: turnout.eligible, s: "" },
              { k: "Ballots cast", v: turnout.voted, s: "" },
              { k: "Turnout", v: turnout.turnoutPct, s: "%", d: 1 },
              { k: "Candidates", v: candidates.length, s: "" },
            ].map((x) => (
              <div key={x.k} className="bg-surface px-6 py-7 text-center">
                <p className="text-4xl font-extrabold tracking-tight sm:text-5xl"><AnimatedNumber value={x.v} suffix={x.s} decimals={x.d ?? 0} /></p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{x.k}</p>
              </div>
            ))}
          </div>
          {election && (
            <p className="mt-4 text-center text-xs text-muted">Voting window: {fmtDateTime(election.opens_at)} – {fmtDateTime(election.closes_at)} (Asia/Dhaka)</p>
          )}
        </section>
      )}

      {/* ───────────── CANDIDATES ───────────── */}
      <section id="candidates" className="relative scroll-mt-24 overflow-hidden py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Heading eyebrow="Position · Class Representative" title="Meet the candidates" subtitle="Approved by the Election Committee. Order does not imply ranking." />
          {candidates.length === 0 ? (
            <div className="mt-12 rounded-3xl border border-dashed border-line bg-surface p-14 text-center text-muted">Candidates will be announced by the Election Committee.</div>
          ) : (
            <div className="mt-14 flex flex-wrap justify-center gap-6">
              {candidates.map((c, i) => (
                <SpotlightCard key={c.id} className="reveal group w-full overflow-hidden rounded-3xl border border-line bg-surface shadow-card transition duration-500 hover:-translate-y-1.5 hover:shadow-lift sm:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="relative aspect-[4/4.4] overflow-hidden bg-navy">
                    <CandidateAvatar name={c.display_name} url={c.photo_url} className="size-full text-5xl transition duration-700 group-hover:scale-[1.06]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/30 to-transparent" />
                    <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-navy/60 px-3 py-1 text-[11px] font-semibold tracking-wide text-white backdrop-blur">
                      CANDIDATE · {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <h3 className="text-2xl font-bold tracking-tight text-white">{c.display_name}</h3>
                      <p className="mt-0.5 text-sm text-slate-300">Roll {c.roll_number}</p>
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="line-clamp-3 min-h-[3.9rem] text-sm leading-relaxed text-slate-600">{c.introduction || "Introduction coming soon."}</p>
                    <Link href={`/candidates/${c.id}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-electric-600 transition hover:gap-2.5">
                      Read manifesto <ArrowUpRight className="size-4" />
                    </Link>
                  </div>
                </SpotlightCard>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ───────────── HOW IT WORKS ───────────── */}
      <section id="how-it-works" className="noise relative scroll-mt-24 overflow-hidden bg-navy py-20 text-white sm:py-24">
        <div className="aurora opacity-60" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <Heading dark eyebrow="Four steps · about two minutes" title="Vote in under two minutes" subtitle="Designed for your phone. No app, no account, no passwords." />
          <ol className="relative mt-16 grid gap-5 md:grid-cols-4">
            <div className="absolute left-[12%] right-[12%] top-7 hidden h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent md:block" aria-hidden />
            {[
              { icon: Fingerprint, t: "Enter your roll", d: "Type your university roll number." },
              { icon: KeyRound, t: "Verify the code", d: "A 6-digit one-time code goes to your registered email or phone." },
              { icon: Vote, t: "Choose & confirm", d: "Select one candidate, review, then confirm." },
              { icon: ReceiptText, t: "Keep your receipt", d: "A receipt ID proves your ballot counted — never who you chose." },
            ].map(({ icon: Icon, t, d }, i) => (
              <li key={t} className={cn("reveal relative text-center", `reveal-delay-${i}`)}>
                <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-electric to-indigo-500 shadow-glow">
                  <Icon className="size-6" aria-hidden />
                  <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-navy bg-white text-[11px] font-bold text-navy">{i + 1}</span>
                </div>
                <h3 className="mt-5 font-semibold">{t}</h3>
                <p className="mx-auto mt-1.5 max-w-[16rem] text-sm leading-relaxed text-slate-400">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────────── SECURITY BENTO ───────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <Heading eyebrow="Trust by design" title="Built so nobody has to be trusted" subtitle="The rules are enforced inside the database itself — not just by the website." />
        <div className="mt-14 grid gap-4 md:grid-cols-6">
          {[
            { icon: Lock, t: "One person, one vote", d: "Row locks and a unique constraint make a second ballot impossible — even under thousands of simultaneous requests.", span: "md:col-span-3", tone: "from-blue-50 to-white" },
            { icon: EyeOff, t: "A genuinely secret ballot", d: "Who voted and what was chosen live in separate tables with no link between them. Your receipt never shows your choice.", span: "md:col-span-3", tone: "from-indigo-50 to-white" },
            { icon: ShieldCheck, t: "Sealed results", d: "Candidate-wise counts cannot be computed until voting closes.", span: "md:col-span-2", tone: "from-slate-50 to-white" },
            { icon: FileClock, t: "Tamper-evident audit trail", d: "Every administrative action is recorded in a hash-chained, append-only log.", span: "md:col-span-2", tone: "from-slate-50 to-white" },
            { icon: Gavel, t: "Two-person corrections", d: "No ballot is ever edited. Corrections need a reason and a second administrator’s approval.", span: "md:col-span-2", tone: "from-slate-50 to-white" },
          ].map(({ icon: Icon, t, d, span, tone }, i) => (
            <SpotlightCard key={t} className={cn("reveal rounded-3xl border border-line bg-gradient-to-br p-7 shadow-card", tone, span, `reveal-delay-${i % 3}`)}>
              <span className="flex size-11 items-center justify-center rounded-xl bg-navy text-white shadow-lg shadow-navy/20"><Icon className="size-5" /></span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{d}</p>
            </SpotlightCard>
          ))}
        </div>
      </section>

      {/* ───────────── TIMELINE ───────────── */}
      <section className="border-y border-line bg-gradient-to-b from-white to-canvas py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Heading eyebrow="Election activity" title="Timeline" subtitle="Follow the election from announcement to the official result." />
          <ol className="relative mt-14 space-y-8 border-l border-line pl-9">
            {timeline.map(({ t, d, when, icon: Icon }, i) => {
              const done = i < stateIndex || (status === "RESULTS_PUBLISHED");
              const current = i === stateIndex && status !== "RESULTS_PUBLISHED";
              return (
                <li key={t} className="reveal relative">
                  <span className={cn("absolute -left-[3.15rem] flex size-9 items-center justify-center rounded-full border-4 border-canvas",
                    done ? "bg-success text-white" : current ? "bg-electric text-white shadow-glow" : "bg-slate-200 text-slate-500")}>
                    {done ? <BadgeCheck className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="font-semibold">{t}</h3>
                    {current && <span className="rounded-full bg-electric-50 px-2.5 py-0.5 text-[11px] font-semibold text-electric-600">In progress</span>}
                    {when && <span className="text-xs text-muted">{when}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{d}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ───────────── GUIDELINES + FAQ ───────────── */}
      <section id="guidelines" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Heading align="left" eyebrow="Before you vote" title="Election guidelines" subtitle="Enforced by the system and by the Election Committee." />
            <Button asChild size="lg" className="mt-8"><Link href="/vote">Go to voter portal <ArrowRight /></Link></Button>
          </div>
          <div className="space-y-3">
            {[
              [`Who can vote?`, `Only registered, active students of ${settings.batch}. Your roll number must be on the official register.`],
              ["How many votes do I get?", "Exactly one ballot for one Class Representative candidate. Once submitted, it is final — nobody, including administrators, can change it."],
              ["I didn’t get my code.", "Wait a minute and request a new one, and check spam. If your registered contact is wrong, report it on the help page so the committee can correct it."],
              ["Can someone see who I voted for?", "No. Your identity and your choice are stored separately with no link between them. Your receipt proves a ballot was recorded, not what it contained."],
              ["Someone voted using my identity.", "Report it immediately on the help page. The committee investigates in person. A report never creates an extra ballot."],
              ["Can I vote for someone else or share my code?", "No. Voting on behalf of others is misconduct. Never share your one-time code — committee members will never ask for it."],
            ].map(([q, a], i) => (
              <details key={q} className={cn("reveal group rounded-2xl border border-line bg-surface p-5 shadow-card open:shadow-lift", `reveal-delay-${i % 3}`)}>
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                  {q}
                  <ChevronDown className="faq-chevron size-5 shrink-0 text-muted transition" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── COMMITTEE + HELP ───────────── */}
      <section id="committee" className="scroll-mt-24 border-t border-line bg-surface py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <Heading align="left" eyebrow="Independent oversight" title="Election Committee" />
            {settings.committee.length ? (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {settings.committee.map((m) => (
                  <div key={m.name} className="flex items-center gap-4 rounded-2xl border border-line bg-canvas p-4 transition hover:border-electric/40 hover:bg-white hover:shadow-card">
                    <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-navy-700 to-navy text-sm font-bold text-white ring-2 ring-gold/40">
                      {m.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.name}</p>
                      <p className="truncate text-sm text-muted">{m.designation}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted">Committee members will be listed here once announced.</p>
            )}
          </div>
          <div className="noise relative h-fit overflow-hidden rounded-3xl bg-navy p-7 text-white shadow-lift">
            <div className="aurora opacity-50" aria-hidden />
            <div className="relative">
              <LifeBuoy className="size-7 text-blue-300" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold">Need help?</h3>
              <p className="mt-1.5 text-sm text-slate-400">Code not arriving, roll not accepted, or a suspected misuse of your identity — tell the committee.</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-200">
                {settings.contact.email && <li className="flex items-center gap-2.5"><Mail className="size-4 text-slate-400" /><a className="hover:text-white" href={`mailto:${settings.contact.email}`}>{settings.contact.email}</a></li>}
                {settings.contact.phone && <li className="flex items-center gap-2.5"><Phone className="size-4 text-slate-400" />{settings.contact.phone}</li>}
                {settings.contact.office && <li className="flex items-center gap-2.5"><MapPin className="size-4 text-slate-400" />{settings.contact.office}</li>}
                <li className="flex items-center gap-2.5"><Smartphone className="size-4 text-slate-400" />Works on any modern phone browser</li>
              </ul>
              <Button asChild className="mt-7 w-full bg-white text-navy hover:bg-slate-100"><Link href="/help">Report a problem</Link></Button>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── FINAL CTA ───────────── */}
      <section className="noise relative isolate overflow-hidden bg-navy py-20 text-center text-white">
        <div className="aurora" aria-hidden><i /></div>
        <div className="relative mx-auto max-w-2xl px-4">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Make your vote <span className="text-gold">count</span>.</h2>
          <p className="mt-4 text-slate-300">{votingOpen ? "Voting is live. It takes under two minutes." : "Open the voter portal when the election goes live."}</p>
          <Button asChild size="xl" className="mt-8 bg-gradient-to-r from-electric to-indigo-500 shadow-glow hover:brightness-110">
            <Link href="/vote"><Vote /> {votingOpen ? "Cast your vote" : "Voter portal"} <ArrowRight /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function Heading({ eyebrow, title, subtitle, align = "center", dark = false }: { eyebrow: string; title: string; subtitle?: string; align?: "center" | "left"; dark?: boolean }) {
  return (
    <div className={cn("reveal", align === "center" ? "mx-auto max-w-2xl text-center" : "")}>
      <p className={cn("inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]", dark ? "text-blue-300" : "text-electric")}>
        <span className="h-px w-6 bg-gold" />{eyebrow}<span className={cn("h-px w-6 bg-gold", align === "left" && "hidden")} />
      </p>
      <h2 className={cn("mt-4 text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl", dark && "text-white")}>{title}</h2>
      {subtitle && <p className={cn("mt-4 text-base leading-relaxed", dark ? "text-slate-400" : "text-muted")}>{subtitle}</p>}
    </div>
  );
}
