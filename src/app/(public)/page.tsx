import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, BadgeCheck, CalendarClock, CalendarX2, EyeOff, Fingerprint, KeyRound, LifeBuoy, ListChecks, Lock, Mail, MapPin,
  Phone, ReceiptText, ShieldCheck, Smartphone, Trophy, UserCheck, Users, Vote,
} from "lucide-react";
import { getPublicState } from "@/lib/services/public";
import { Countdown } from "@/components/site/countdown";
import { LiveTurnout } from "@/components/site/live-turnout";
import { StatusPill } from "@/components/site/status-pill";
import { CandidateAvatar } from "@/components/site/candidate-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmtDateTime, STATUS_LABEL } from "@/lib/format";

export default async function HomePage() {
  const { election, settings, turnout, candidates, votingOpen, serverNow } = await getPublicState();
  const status = election?.status ?? null;
  const countdown =
    election && (status === "SCHEDULED" && new Date(election.opens_at) > new Date())
      ? { target: new Date(election.opens_at).toISOString(), label: "Voting opens in" }
      : election && (status === "LIVE" || status === "PAUSED" || status === "SCHEDULED")
        ? { target: new Date(election.closes_at).toISOString(), label: "Voting closes in" }
        : null;

  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-emerald-900 text-white">
        <Image src="/campus/aerial.jpg" alt="Aerial view of the Islamic University campus" fill priority sizes="100vw" className="ken-burns -z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-900/95 via-navy/85 to-navy/70" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_0%,rgb(201_162_74/0.22),transparent_55%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-28 pt-14 sm:px-6 md:pb-36 md:pt-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="animate-fade-up">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={status} className="bg-white/10 text-white ring-white/20" />
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-gold-300">{settings.institution} · ICT Department</span>
            </div>
            <div className="mt-7 flex items-center gap-4">
              <Image src="/campus/logo.png" alt="" width={72} height={68} className="size-16 rounded-2xl ring-2 ring-gold/70 shadow-2xl" aria-hidden />
              <div className="gold-rule hidden h-px w-24 sm:block" />
            </div>
            <h1 className="font-display mt-6 text-5xl font-bold leading-[1.02] sm:text-6xl md:text-7xl">
              Class Representative
              <span className="text-gold-gradient block italic">Election 2026</span>
            </h1>
            <p className="mt-4 text-lg font-medium text-slate-200 sm:text-xl">Islamic University — {settings.department.replace("Department of ", "")}</p>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300">
              {election?.description?.trim() ||
                `Choose the Class Representative who will speak for ${settings.batch}. Every registered student casts one secret ballot, verified by a one-time code sent to their registered contact.`}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl" className="bg-gold text-navy shadow-xl shadow-black/30 hover:bg-gold-300">
                <Link href="/vote">
                  <Vote /> {votingOpen ? "Start voting" : "Open voter portal"} <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="border-white/25 bg-white/5 text-white backdrop-blur hover:bg-white/15">
                <Link href={status === "RESULTS_PUBLISHED" ? "/results" : "#candidates"}>
                  {status === "RESULTS_PUBLISHED" ? <><Trophy /> View official results</> : <><Users /> Meet the candidates</>}
                </Link>
              </Button>
            </div>
          </div>

          <div className="glass animate-fade-up rounded-3xl p-5 shadow-2xl shadow-black/30 [animation-delay:120ms] sm:p-6">
            {countdown ? (
              <Countdown target={countdown.target} serverNow={serverNow} label={countdown.label} dark />
            ) : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Election status</p>
                <p className="font-display mt-3 text-3xl font-bold">{status ? STATUS_LABEL[status] : "Not yet announced"}</p>
                <p className="mt-1 text-sm text-slate-300">
                  {status === "RESULTS_PUBLISHED" ? "The official result has been published by the Election Committee." : status === "CLOSED" ? "Voting has ended. Results will be published after verification." : "The Election Committee will announce the schedule here."}
                </p>
              </div>
            )}
            {status === "PAUSED" && (
              <p className="mt-4 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">Voting is temporarily paused by the Election Committee.</p>
            )}
            {turnout && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <LiveTurnout initial={turnout} live={status === "LIVE"} dark />
              </div>
            )}
          </div>
        </div>
        <div className="gold-rule absolute inset-x-0 bottom-0" />
      </section>

      {/* ELECTION INFORMATION */}
      <section className="relative z-10 mx-auto -mt-14 max-w-6xl px-4 sm:px-6" aria-label="Election information">
        <div className="relative grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            { icon: CalendarClock, label: "Opens", value: election ? fmtDateTime(election.opens_at) : "TBA" },
            { icon: CalendarX2, label: "Closes", value: election ? fmtDateTime(election.closes_at) : "TBA" },
            { icon: BadgeCheck, label: "Status", value: status ? STATUS_LABEL[status] : "—" },
            { icon: Users, label: "Eligible voters", value: turnout ? String(turnout.eligible) : "—" },
            { icon: UserCheck, label: "Participation", value: turnout ? String(turnout.voted) : "—" },
            { icon: ListChecks, label: "Turnout", value: turnout ? `${turnout.turnoutPct}%` : "—" },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label} className="border-gold/30 p-4 shadow-lift">
              <Icon className="size-4 text-emerald" aria-hidden />
              <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug">{value}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CAMPUS */}
      <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6" aria-label="Our campus">
        <SectionHeading eyebrow="Islamic University · Kushtia" title="One campus. One voice." subtitle="Under the gulmohar trees of our university, 28th-batch ICT students choose who will carry their voice." />
        <div className="mt-12 grid gap-4 md:grid-cols-6 md:grid-rows-2">
          <figure className="group relative min-h-64 overflow-hidden rounded-3xl md:col-span-4 md:row-span-2 md:min-h-[26rem]">
            <Image src="/campus/aerial.jpg" alt="Campus aerial view" fill sizes="(min-width:768px) 66vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-transparent" />
            <figcaption className="font-display absolute bottom-5 left-6 text-2xl text-white">The red-brick campus</figcaption>
          </figure>
          <figure className="group relative min-h-44 overflow-hidden rounded-3xl md:col-span-2">
            <Image src="/campus/gate.jpg" alt="Islamic University main gate beneath a gulmohar tree" fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-transparent" />
            <figcaption className="font-display absolute bottom-4 left-5 text-lg text-white">The gate</figcaption>
          </figure>
          <figure className="group relative min-h-44 overflow-hidden rounded-3xl md:col-span-2">
            <Image src="/campus/building.jpg" alt="Academic building framed by blooming gulmohar" fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-transparent" />
            <figcaption className="font-display absolute bottom-4 left-5 text-lg text-white">Where we learn</figcaption>
          </figure>
        </div>
      </section>

      {/* CANDIDATES */}
      <section id="candidates" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Position · Class Representative" title="Meet the candidates" subtitle="Approved by the Election Committee. Candidate order does not imply ranking." />
        {candidates.length === 0 ? (
          <Card className="mt-10 p-10 text-center text-muted">Candidates will be announced by the Election Committee.</Card>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((c, i) => (
              <Card key={c.id} className="group flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-lift animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                  <CandidateAvatar name={c.display_name} url={c.photo_url} className="size-full transition duration-500 group-hover:scale-[1.03]" />
                  <span className="absolute left-3 top-3 rounded-full bg-navy/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">CR Candidate</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-lg font-semibold tracking-tight">{c.display_name}</h3>
                  <p className="text-sm text-muted">Roll {c.roll_number}</p>
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">{c.introduction || "Introduction coming soon."}</p>
                  <div className="mt-auto pt-5">
                    <Button asChild variant="subtle" className="w-full">
                      <Link href={`/candidates/${c.id}`}>Read manifesto <ArrowRight /></Link>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="scroll-mt-28 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Four steps · about two minutes" title="How voting works" />
          <ol className="mt-12 grid gap-5 md:grid-cols-4">
            {[
              { icon: Fingerprint, t: "Enter your roll", d: "Type your university roll number in the voter portal." },
              { icon: KeyRound, t: "Verify the code", d: "A 6-digit one-time code is sent to your registered email or phone." },
              { icon: Vote, t: "Choose & confirm", d: "Select one CR candidate, review your choice and confirm." },
              { icon: ReceiptText, t: "Keep your receipt", d: "You receive a receipt ID proving your ballot was recorded — not who you chose." },
            ].map(({ icon: Icon, t, d }, i) => (
              <li key={t} className="relative rounded-2xl border border-line bg-canvas p-5">
                <span className="text-xs font-bold text-emerald">0{i + 1}</span>
                <Icon className="mt-3 size-6 text-ink" aria-hidden />
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { icon: EyeOff, t: "Secret ballot", d: "Who voted and what was chosen are stored separately and never linked by the system." },
              { icon: Lock, t: "One person, one vote", d: "Enforced inside the database with locking and unique constraints — duplicates are impossible." },
              { icon: ShieldCheck, t: "Sealed results", d: "Candidate-wise counts cannot be computed until voting closes, even by administrators." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="flex gap-4 rounded-2xl bg-emerald-900 p-5 text-white ring-1 ring-gold/30">
                <Icon className="size-5 shrink-0 text-gold-300" aria-hidden />
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GUIDELINES */}
      <section id="guidelines" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading eyebrow="Before you vote" title="Election guidelines" subtitle="Please read carefully. These rules are enforced by the system and by the Election Committee." align="left" />
          <ul className="grid gap-3">
            {[
              `Only registered, active students of ${settings.batch} may vote.`,
              "Each student may cast exactly one ballot for one Class Representative candidate.",
              "A submitted ballot is final and cannot be changed by you or by any administrator.",
              "Never share your one-time code. Committee members will never ask for it.",
              "Vote yourself, privately, on your own device. Voting on behalf of others is misconduct.",
              "Voting is only possible while the election is live; paused or closed elections accept no ballots.",
              "If you suspect someone voted with your identity, report it immediately through the help page.",
            ].map((g, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed shadow-card">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald/10 text-xs font-bold text-emerald">{i + 1}</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-navy text-white">
        <Image src="/campus/aerial-wide.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy/95 via-emerald-900/85 to-navy/60" />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-300">Your voice · Your batch</p>
          <h2 className="font-display mx-auto mt-4 max-w-2xl text-4xl font-bold sm:text-5xl">Every vote shapes the year ahead.</h2>
          <Button asChild size="xl" className="mt-9 bg-gold text-navy hover:bg-gold-300"><Link href="/vote"><Vote /> Go to the voter portal <ArrowRight /></Link></Button>
        </div>
      </section>

      {/* COMMITTEE + HELP */}
      <section id="committee" className="scroll-mt-28 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <SectionHeading eyebrow="Independent oversight" title="Election Committee" align="left" />
            {settings.committee.length ? (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {settings.committee.map((m) => (
                  <div key={m.name} className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-4">
                    <div className="flex size-11 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
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
          <Card className="h-fit p-6">
            <LifeBuoy className="size-6 text-emerald" aria-hidden />
            <h3 className="mt-4 text-lg font-semibold">Need help?</h3>
            <p className="mt-1 text-sm text-muted">Code not arriving, roll not accepted, or a suspected misuse of your identity — tell the committee.</p>
            <ul className="mt-5 space-y-2.5 text-sm">
              {settings.contact.email && <li className="flex items-center gap-2"><Mail className="size-4 text-muted" /> <a className="hover:text-emerald" href={`mailto:${settings.contact.email}`}>{settings.contact.email}</a></li>}
              {settings.contact.phone && <li className="flex items-center gap-2"><Phone className="size-4 text-muted" /> {settings.contact.phone}</li>}
              {settings.contact.office && <li className="flex items-center gap-2"><MapPin className="size-4 text-muted" /> {settings.contact.office}</li>}
              <li className="flex items-center gap-2"><Smartphone className="size-4 text-muted" /> Works on any modern phone browser</li>
            </ul>
            <Button asChild className="mt-6 w-full" variant="navy">
              <Link href="/help">Report a problem</Link>
            </Button>
          </Card>
        </div>
      </section>
    </>
  );
}

function SectionHeading({ eyebrow, title, subtitle, align = "center" }: { eyebrow: string; title: string; subtitle?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald">{eyebrow}</p>
      <div className="gold-rule mt-3 h-px w-16" style={align === "center" ? { marginInline: "auto" } : undefined} />
      <h2 className="font-display mt-4 text-3xl font-bold sm:text-5xl">{title}</h2>
      {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
    </div>
  );
}
