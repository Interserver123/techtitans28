import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, BadgeCheck, ChevronDown, EyeOff, FileClock, Fingerprint, Gavel, KeyRound, LifeBuoy, Lock, Mail, MapPin,
  Phone, ReceiptText, ShieldCheck, Smartphone, Trophy, Users, Vote, Zap,
} from "lucide-react";
import { getPublicState } from "@/lib/services/public";
import { UrgentContact } from "@/components/site/urgent-contact";
import { RuleBanner } from "@/components/site/rule-banner";
import { Countdown } from "@/components/site/countdown";
import { LiveTurnout } from "@/components/site/live-turnout";
import { SpotlightCard } from "@/components/site/spotlight-card";
import { AnimatedNumber } from "@/components/site/animated-number";
import { Marquee } from "@/components/site/marquee";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";
import { getLang } from "@/lib/i18n-server";
import { dict, num, posLabel } from "@/lib/i18n";
import { Alpana } from "@/components/site/alpana";
import { CandidateGrid } from "@/components/site/candidate-grid";
import { initials } from "@/components/site/candidate-avatar";
import { cn } from "@/lib/utils";

/** Proctorial Body members (photos in public/committee). */
const PROCTORIAL = [
  { key: "afrajur", photo: "/committee/afrajur-zihad.webp" },
  { key: "limon", photo: "/committee/limon-sarkar.webp" },
  { key: "ratul", photo: "/committee/ratul-roy.webp" },
] as const;

/** Committee entries from Settings that are already shown above as Proctorial Body cards. */
const isProctorial = (name: string) => /afrajur|limon|ratul/i.test(name);

export default async function HomePage() {
  const [{ election, settings, turnout, candidates, positions, votingOpen, serverNow }, lang] = await Promise.all([getPublicState(), getLang()]);
  const t = dict(lang);
  const otherMembers = settings.committee.filter((m) => !isProctorial(m.name));
  const dt = (d: Date | string | null | undefined) => fmtDateTime(d, {}, lang);
  const status = election?.status ?? null;
  const countdown =
    election && status === "SCHEDULED" && new Date(election.opens_at) > new Date()
      ? { target: new Date(election.opens_at).toISOString(), label: t.hero.opensIn }
      : election && (status === "LIVE" || status === "PAUSED" || status === "SCHEDULED")
        ? { target: new Date(election.closes_at).toISOString(), label: t.hero.closesIn }
        : null;

  const order = ["DRAFT", "SCHEDULED", "LIVE", "CLOSED", "RESULTS_PUBLISHED"];
  const at = status === "PAUSED" ? 2 : Math.max(0, order.indexOf(status ?? "DRAFT"));
  const tl = t.timeline.items(num(candidates.length, lang));
  const timeline = [
    { t: tl[0][0], d: tl[0][1], when: null as string | null, icon: Users },
    { t: tl[1][0], d: tl[1][1], when: election ? dt(election.opens_at) : t.timeline.tba, icon: Zap },
    { t: tl[2][0], d: tl[2][1], when: election ? dt(election.closes_at) : t.timeline.tba, icon: Lock },
    { t: tl[3][0], d: tl[3][1], when: election?.results_verified_at ? dt(election.results_verified_at) : null, icon: Gavel },
    { t: tl[4][0], d: tl[4][1], when: election?.results_published_at ? dt(election.results_published_at) : null, icon: Trophy },
  ];
  const progress = [1, 2, 3, 3, 4][Math.min(at, 4)];
  const stateIndex = status === "RESULTS_PUBLISHED" ? 4 : status === "CLOSED" ? (election?.results_verified_at ? 3 : 2) : status === "LIVE" || status === "PAUSED" ? 1 : 0;
  void progress;

  return (
    <>
      {/* ───────────── HERO ───────────── */}
      <section className="noise relative isolate overflow-hidden bg-navy text-white">
        <Image src="/campus/building.jpg" alt="" fill priority sizes="100vw" className="-z-30 scale-110 object-cover blur-[2px]" aria-hidden />
        <div className="absolute inset-0 -z-20 bg-gradient-to-r from-navy via-navy/90 to-emerald-900/70" aria-hidden />
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(60%_60%_at_78%_35%,rgb(201_162_74/0.25),transparent_70%)]" aria-hidden />
        {/* Oversized outlined batch number as a watermark */}
        <span className="font-display pointer-events-none absolute -bottom-16 -left-6 -z-10 select-none text-[16rem] font-bold leading-none text-transparent [-webkit-text-stroke:1px_rgb(201_162_74/0.18)] sm:text-[22rem]" aria-hidden>{num(28, lang)}</span>

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-28 sm:px-6 sm:pt-32 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-36">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
              <span className="h-px w-8 bg-gold" /> {t.institution}
            </p>
            <h1 className={cn("font-display mt-6 text-[2.6rem] font-bold sm:text-6xl lg:text-[4.2rem]", lang === "bn" ? "leading-[1.12]" : "leading-[1.04]")}>
              {t.ui.heroL1}
              <br />
              {t.ui.heroL2a}<span className="relative inline-block text-gold-gradient">{t.ui.heroL2b}<svg className="absolute -bottom-2 left-0 h-3 w-full text-gold/70" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden><path d="M2 9 Q 50 1 98 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>{t.ui.heroL2c}
            </h1>
            <p className="font-display mt-5 text-xl text-gold-300/95 sm:text-2xl">{t.ui.heroSub}</p>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300 sm:text-base">
              {(lang === "en" && election?.description?.trim()) || t.hero.lead(settings.batch)}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl" className="group bg-gold text-navy shadow-[0_14px_40px_-14px_rgb(201_162_74/0.9)] hover:bg-gold-300">
                <Link href="/vote">
                  <Vote /> {votingOpen ? t.hero.start : t.hero.open}
                  <ArrowRight className="transition group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="border-white/20 bg-white/5 text-white backdrop-blur hover:bg-white/10">
                <Link href={status === "RESULTS_PUBLISHED" ? "/results" : "#candidates"}>
                  {status === "RESULTS_PUBLISHED" ? <><Trophy /> {t.hero.official}</> : <><Users /> {t.hero.meet}</>}
                </Link>
              </Button>
            </div>

            {candidates.length > 0 && (
              <Link href="#candidates" className="group mt-10 inline-flex items-center gap-4 rounded-full bg-white/[0.06] py-2 pl-2 pr-5 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/10">
                <span className="flex -space-x-2.5" aria-hidden>
                  {candidates.slice(0, 5).map((c, i) => (
                    <span key={c.id} className={cn("flex size-9 items-center justify-center rounded-full border-2 border-navy text-[11px] font-bold", ["bg-emerald text-white", "bg-gold text-navy", "bg-[#173126] text-gold-300", "bg-white text-navy", "bg-[#0b6040] text-white"][i])}>
                      {initials(c.display_name)}
                    </span>
                  ))}
                  {candidates.length > 5 && <span className="flex size-9 items-center justify-center rounded-full border-2 border-navy bg-white/15 text-[11px] font-bold text-white">+{num(candidates.length - 5, lang)}</span>}
                </span>
                <span className="text-sm leading-tight">
                  <span className="block font-semibold text-white">{t.ui.candidatesN(num(candidates.length, lang))}</span>
                  <span className="block text-xs text-slate-400 transition group-hover:text-gold-300">{t.ui.seeAll}</span>
                </span>
              </Link>
            )}
          </div>

          {/* Arched window onto the campus — after the arches of the university gate */}
          <div className="relative mx-auto w-full max-w-[420px] animate-fade-up [animation-delay:150ms] lg:mr-0">
            <div className="relative aspect-[4/5] overflow-hidden rounded-b-[2rem] rounded-t-[999px] border border-gold/50 p-2 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]">
              <div className="relative size-full overflow-hidden rounded-b-[1.6rem] rounded-t-[999px]">
                <Image src="/campus/academic-building.webp" alt={t.ui.archAlt} fill priority sizes="(min-width:1024px) 420px, 90vw" className="ken-burns object-cover object-[62%_center]" />
                <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/20 to-transparent" />
              </div>
            </div>
            <Image src="/campus/logo.png" alt="" width={72} height={68} className="absolute left-1/2 top-0 size-16 -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-2xl ring-4 ring-navy" aria-hidden />

            <div className="glass relative -mt-28 mx-3 rounded-3xl p-5 sm:mx-6 sm:p-6">
              {countdown ? (
                <Countdown target={countdown.target} serverNow={serverNow} label={countdown.label} dark lang={lang} />
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">{t.hero.statusLabel}</p>
                  <p className="font-display mt-2 text-2xl font-bold">{status ? t.status[status] : t.hero.notAnnounced}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {status === "RESULTS_PUBLISHED" ? t.hero.publishedMsg : status === "CLOSED" ? t.hero.closedMsg : t.hero.scheduleMsg}
                  </p>
                </div>
              )}
              {status === "PAUSED" && <p className="mt-4 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{t.hero.pausedMsg}</p>}
              {turnout && (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <LiveTurnout initial={turnout} live={status === "LIVE"} dark lang={lang} />
                </div>
              )}
            </div>
          </div>
        </div>

        <ul className="relative mx-auto -mt-6 flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-3 px-4 pb-14 text-xs font-medium text-slate-400 sm:px-6 lg:justify-start">
          {[[ShieldCheck, t.hero.trust[0]], [EyeOff, t.hero.trust[1]], [Lock, t.ui.sealedAfter], [FileClock, t.hero.trust[2]]].map(([Icon, label]) => {
            const I = Icon as typeof ShieldCheck;
            return <li key={label as string} className="flex items-center gap-2"><I className="size-4 text-gold-300" />{label as string}</li>;
          })}
        </ul>
        <Alpana className="absolute inset-x-0 bottom-0 opacity-70" />
      </section>

      {/* ───────────── TRUST MARQUEE ───────────── */}
      <div className="border-b border-line bg-surface py-5">
        <Marquee
          className="text-sm font-medium text-slate-500"
          items={t.marquee(settings.batch).map((m) => <><span className="size-1.5 rotate-45 bg-gold" />{m}</>)}
        />
      </div>

      {/* ───────────── CAMPUS ───────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6" aria-label="Our campus">
        <Heading eyebrow={t.campus.eyebrow} title={t.campus.title} subtitle={t.campus.sub} />
        <div className="mt-12 grid gap-4 md:grid-cols-6 md:grid-rows-2">
          <figure className="reveal group relative min-h-64 overflow-hidden rounded-3xl shadow-lift md:col-span-4 md:row-span-2 md:min-h-[26rem]">
            <Image src="/campus/ict-department.webp" alt="Department of Information & Communication Technology, Islamic University, Kushtia" fill sizes="(min-width:768px) 66vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-transparent" />
            <figcaption className="font-display absolute bottom-5 left-6 text-2xl text-white">{t.campus.c1}</figcaption>
          </figure>
          <figure className="reveal reveal-delay-1 group relative min-h-44 overflow-hidden rounded-3xl shadow-lift md:col-span-2">
            <Image src="/campus/gate.jpg" alt="Main gate beneath a blooming gulmohar tree" fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-transparent" />
            <figcaption className="font-display absolute bottom-4 left-5 text-lg text-white">{t.campus.c2}</figcaption>
          </figure>
          <figure className="reveal reveal-delay-2 group relative min-h-44 overflow-hidden rounded-3xl shadow-lift md:col-span-2">
            <Image src="/campus/building.jpg" alt="Academic building framed by gulmohar blossoms" fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-transparent" />
            <figcaption className="font-display absolute bottom-4 left-5 text-lg text-white">{t.campus.c3}</figcaption>
          </figure>
        </div>
      </section>

      {/* ───────────── LIVE STATS ───────────── */}
      {turnout && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-label="Election at a glance">
          <div className="reveal grid gap-px overflow-hidden rounded-3xl border border-line bg-line shadow-elite sm:grid-cols-4">
            {[
              { k: t.stats.eligible, v: turnout.eligible, s: "" },
              { k: t.stats.cast, v: turnout.voted, s: "" },
              { k: t.stats.turnout, v: turnout.turnoutPct, s: "%", d: 1 },
              { k: t.stats.candidates, v: candidates.length, s: "" },
            ].map((x) => (
              <div key={x.k} className="bg-surface px-6 py-7 text-center">
                <p className="text-4xl font-extrabold tracking-tight sm:text-5xl"><AnimatedNumber value={x.v} suffix={x.s} decimals={x.d ?? 0} lang={lang} /></p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{x.k}</p>
              </div>
            ))}
          </div>
          {election && (
            <p className="mt-4 text-center text-xs text-muted">{t.stats.window}: {dt(election.opens_at)} – {dt(election.closes_at)}</p>
          )}
        </section>
      )}

      {/* ───────────── CANDIDATES ───────────── */}
      <section id="candidates" className="relative scroll-mt-24 overflow-hidden py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Heading eyebrow={t.cand.eyebrow} title={t.cand.title} subtitle={t.cand.sub} />
          {candidates.length === 0 ? (
            <div className="mt-12 rounded-3xl border border-dashed border-line bg-surface p-14 text-center text-muted">{t.cand.empty}</div>
          ) : positions.length > 1 ? (
            <>
              <RuleBanner lang={lang} className="mx-auto mt-8 max-w-2xl" />
              {positions.map((p) => {
                const group = candidates.filter((c) => c.position_id === p.id);
                if (!group.length) return null;
                return (
                  <div key={p.id} className="mt-14 first:mt-10">
                    <h3 className="font-display flex items-center justify-center gap-3 text-center text-2xl font-bold sm:text-3xl">
                      <span className="h-px w-8 bg-gold" aria-hidden />{posLabel(p.gender, lang, true)}
                      <span className="rounded-full bg-emerald-900 px-3 py-1 font-sans text-xs font-semibold text-gold-300">{t.ui.candidatesN(num(group.length, lang))}</span>
                      <span className="h-px w-8 bg-gold" aria-hidden />
                    </h3>
                    <CandidateGrid lang={lang} candidates={group.map((c) => ({ id: c.id, display_name: c.display_name, roll_number: c.roll_number, introduction: c.introduction, photo_url: c.photo_url }))} />
                  </div>
                );
              })}
            </>
          ) : (
            <CandidateGrid lang={lang} candidates={candidates.map((c) => ({ id: c.id, display_name: c.display_name, roll_number: c.roll_number, introduction: c.introduction, photo_url: c.photo_url }))} />
          )}
        </div>
      </section>

      {/* ───────────── HOW IT WORKS ───────────── */}
      <section id="how-it-works" className="noise relative isolate scroll-mt-24 overflow-hidden bg-emerald-900 py-20 text-white sm:py-24">
        <Image src="/campus/building.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover opacity-25 mix-blend-luminosity" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-900/90 to-navy/95" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <Heading dark eyebrow={t.how.eyebrow} title={t.how.title} subtitle={t.how.sub} />
          <ol className="relative mt-16 grid gap-5 md:grid-cols-4">
            <div className="absolute left-[12%] right-[12%] top-7 hidden h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent md:block" aria-hidden />
            {[Fingerprint, KeyRound, Vote, ReceiptText].map((Icon, i) => ({ icon: Icon, t: t.how.steps[i][0], d: t.how.steps[i][1] })).map(({ icon: Icon, t: title, d }, i) => (
              <li key={title} className={cn("reveal relative text-center", `reveal-delay-${i}`)}>
                <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald to-emerald-900 ring-1 ring-gold/50 shadow-glow">
                  <Icon className="size-6" aria-hidden />
                  <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-navy bg-white text-[11px] font-bold text-navy">{num(i + 1, lang)}</span>
                </div>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mx-auto mt-1.5 max-w-[16rem] text-sm leading-relaxed text-slate-400">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────────── SECURITY BENTO ───────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <Heading eyebrow={t.trust.eyebrow} title={t.trust.title} subtitle={t.trust.sub} />
        <div className="mt-14 grid gap-4 md:grid-cols-6">
          {[
            { icon: Lock, t: t.trust.cards[0][0], d: t.trust.cards[0][1], span: "md:col-span-3", tone: "from-emerald-50 to-white" },
            { icon: EyeOff, t: t.trust.cards[1][0], d: t.trust.cards[1][1], span: "md:col-span-3", tone: "from-amber-50 to-white" },
            { icon: ShieldCheck, t: t.trust.cards[2][0], d: t.trust.cards[2][1], span: "md:col-span-2", tone: "from-slate-50 to-white" },
            { icon: FileClock, t: t.trust.cards[3][0], d: t.trust.cards[3][1], span: "md:col-span-2", tone: "from-slate-50 to-white" },
            { icon: Gavel, t: t.trust.cards[4][0], d: t.trust.cards[4][1], span: "md:col-span-2", tone: "from-slate-50 to-white" },
          ].map(({ icon: Icon, t: title, d, span, tone }, i) => (
            <SpotlightCard key={title} className={cn("reveal rounded-3xl border border-line bg-gradient-to-br p-7 shadow-card", tone, span, `reveal-delay-${i % 3}`)}>
              <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-900 text-gold-300 shadow-lg shadow-navy/20"><Icon className="size-5" /></span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{d}</p>
            </SpotlightCard>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6"><Alpana tone="emerald" className="opacity-40" /></div>

      {/* ───────────── TIMELINE ───────────── */}
      <section className="border-y border-line bg-gradient-to-b from-white to-canvas py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Heading eyebrow={t.timeline.eyebrow} title={t.timeline.title} subtitle={t.timeline.sub} />
          <ol className="relative mt-14 space-y-8 border-l border-line pl-9">
            {timeline.map(({ t: title, d, when, icon: Icon }, i) => {
              const done = i < stateIndex || (status === "RESULTS_PUBLISHED");
              const current = i === stateIndex && status !== "RESULTS_PUBLISHED";
              return (
                <li key={title} className="reveal relative">
                  <span className={cn("absolute -left-[3.15rem] flex size-9 items-center justify-center rounded-full border-4 border-canvas",
                    done ? "bg-success text-white" : current ? "bg-electric text-white shadow-glow" : "bg-slate-200 text-slate-500")}>
                    {done ? <BadgeCheck className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="font-semibold">{title}</h3>
                    {current && <span className="rounded-full bg-electric-50 px-2.5 py-0.5 text-[11px] font-semibold text-electric-600">{t.timeline.inProgress}</span>}
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
            <Heading align="left" eyebrow={t.faq.eyebrow} title={t.faq.title} subtitle={t.faq.sub} />
            <Button asChild size="lg" className="mt-8"><Link href="/vote">{t.faq.go} <ArrowRight /></Link></Button>
          </div>
          <div className="space-y-3">
            {t.faq.items(settings.batch).map(([q, a], i) => (
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
      <section id="committee" className="scroll-mt-24 border-t border-line bg-surface pb-20 sm:pb-24">
        {/* ── Proctorial Body ── */}
        <div className="noise relative isolate overflow-hidden bg-emerald-900 py-16 text-white sm:py-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_50%_0%,rgb(201_162_74/0.22),transparent_70%)]" aria-hidden />
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold text-gold-300">
                <ShieldCheck className="size-4" aria-hidden /> {t.proctorial.eyebrow}
              </p>
              <h2 className="font-display mt-5 text-4xl font-bold sm:text-5xl"><span className="text-gold-gradient">{t.proctorial.title}</span></h2>
              <p className="mt-3 text-slate-300">{t.proctorial.sub}</p>
            </div>
            <ul className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
              {PROCTORIAL.map((p, i) => (
                <li key={p.key} className={cn("reveal group mx-auto w-full max-w-[260px] sm:max-w-none", `reveal-delay-${i}`)}>
                  <div className="relative rounded-[1.75rem] bg-gradient-to-b from-gold via-gold/60 to-gold/20 p-[2px] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)]">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-[1.65rem] bg-navy">
                      <Image src={p.photo} alt={t.proctorial.names[p.key]} fill sizes="(min-width:640px) 300px, 90vw" className="object-cover transition duration-700 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-5 text-center">
                        <p className="font-display text-2xl font-bold">{t.proctorial.names[p.key]}</p>
                        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-gold/90 px-3 py-1 text-xs font-semibold text-navy"><ShieldCheck className="size-3.5 shrink-0" aria-hidden /> {t.proctorial.roles[p.key]}</p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-[1.2fr_0.8fr]">
          {otherMembers.length > 0 && (
          <div>
            <Heading align="left" eyebrow={t.committee.eyebrow} title={t.committee.title} />
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {otherMembers.map((m) => (
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
          </div>
          )}
          <div className={cn("noise relative h-fit overflow-hidden rounded-3xl bg-navy p-7 text-white shadow-lift", otherMembers.length === 0 && "lg:col-span-2 lg:mx-auto lg:w-full lg:max-w-2xl")}>
            <div className="aurora opacity-50" aria-hidden />
            <div className="relative">
              <LifeBuoy className="size-7 text-gold-300" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold">{t.committee.help}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{t.committee.helpText}</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-200">
                {settings.contact.email && <li className="flex items-center gap-2.5"><Mail className="size-4 text-slate-400" /><a className="hover:text-white" href={`mailto:${settings.contact.email}`}>{settings.contact.email}</a></li>}
                {settings.contact.phone && <li className="flex items-center gap-2.5"><Phone className="size-4 text-slate-400" />{settings.contact.phone}</li>}
                {settings.contact.office && <li className="flex items-center gap-2.5"><MapPin className="size-4 text-slate-400" />{settings.contact.office}</li>}
                <li className="flex items-center gap-2.5"><Smartphone className="size-4 text-slate-400" />{t.committee.anyPhone}</li>
              </ul>
              <Button asChild className="mt-7 w-full bg-white text-navy hover:bg-slate-100"><Link href="/help">{t.committee.report}</Link></Button>
              <UrgentContact lang={lang} tone="dark" className="mt-4" />
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── FINAL CTA ───────────── */}
      <section className="noise relative isolate overflow-hidden bg-navy py-24 text-center text-white">
        <Alpana className="absolute inset-x-0 top-0 opacity-70" />
        <Image src="/campus/aerial-wide.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy/95 via-emerald-900/85 to-navy/70" aria-hidden />
        <span className="watermark-bn absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 text-[14rem] sm:text-[22rem]" aria-hidden>{t.cta.watermark}</span>
        <div className="relative mx-auto max-w-2xl px-4">
          <h2 className="font-display text-4xl font-bold sm:text-6xl">{t.cta.a}<span className="text-gold-gradient italic">{t.cta.b}</span>{t.cta.c}</h2>
          <p className="mt-4 text-slate-300">{votingOpen ? t.cta.live : t.cta.notLive}</p>
          <Button asChild size="xl" className="mt-8 bg-gold text-navy shadow-xl shadow-black/30 hover:bg-gold-300">
            <Link href="/vote"><Vote /> {votingOpen ? t.cta.cast : t.voterPortal} <ArrowRight /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function Heading({ eyebrow, title, subtitle, align = "center", dark = false }: { eyebrow: string; title: string; subtitle?: string; align?: "center" | "left"; dark?: boolean }) {
  return (
    <div className={cn("reveal", align === "center" ? "mx-auto max-w-2xl text-center" : "")}>
      <p className={cn("inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]", dark ? "text-gold-300" : "text-emerald")}>
        <span className="h-px w-6 bg-gold" />{eyebrow}<span className={cn("h-px w-6 bg-gold", align === "left" && "hidden")} />
      </p>
      <h2 className={cn("font-display mt-4 text-3xl font-bold sm:text-5xl", dark && "text-white")}>{title}</h2>
      {subtitle && <p className={cn("mt-4 text-base leading-relaxed", dark ? "text-slate-400" : "text-muted")}>{subtitle}</p>}
    </div>
  );
}
