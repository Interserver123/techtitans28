import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, BadgeCheck, ChevronDown, EyeOff, FileClock, Fingerprint, Gavel, KeyRound, LifeBuoy, Lock, Mail, MapPin,
  Phone, ReceiptText, ShieldCheck, Smartphone, Trophy, Users, Vote, Zap,
} from "lucide-react";
import { getPublicState } from "@/lib/services/public";
import { Countdown } from "@/components/site/countdown";
import { LiveTurnout } from "@/components/site/live-turnout";
import { initials } from "@/components/site/candidate-avatar";
import { CandidateGrid } from "@/components/site/candidate-grid";
import { SpotlightCard } from "@/components/site/spotlight-card";
import { AnimatedNumber } from "@/components/site/animated-number";
import { Marquee } from "@/components/site/marquee";
import { Button } from "@/components/ui/button";
import { bnNum, fmtDateTime, STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const { election, settings, turnout, candidates, votingOpen, serverNow } = await getPublicState();
  const status = election?.status ?? null;
  const countdown =
    election && status === "SCHEDULED" && new Date(election.opens_at) > new Date()
      ? { target: new Date(election.opens_at).toISOString(), label: "ভোটগ্রহণ শুরু হতে বাকি" }
      : election && (status === "LIVE" || status === "PAUSED" || status === "SCHEDULED")
        ? { target: new Date(election.closes_at).toISOString(), label: "ভোটগ্রহণ শেষ হতে বাকি" }
        : null;

  const order = ["DRAFT", "SCHEDULED", "LIVE", "CLOSED", "RESULTS_PUBLISHED"];
  const at = status === "PAUSED" ? 2 : Math.max(0, order.indexOf(status ?? "DRAFT"));
  const timeline = [
    { t: "প্রার্থী ঘোষণা", d: `ক্লাস রিপ্রেজেন্টেটিভ পদে ${bnNum(candidates.length)} জন অনুমোদিত প্রার্থী`, when: null as string | null, icon: Users },
    { t: "ভোটগ্রহণ শুরু", d: "যাচাইকৃত শিক্ষার্থীরা একটি করে গোপন ব্যালট দেবেন", when: election ? fmtDateTime(election.opens_at) : "পরে ঘোষণা করা হবে", icon: Zap },
    { t: "ভোটগ্রহণ শেষ", d: "ব্যালট সিলগালা; এরপর আর কোনো ভোট গ্রহণ করা হবে না", when: election ? fmtDateTime(election.closes_at) : "পরে ঘোষণা করা হবে", icon: Lock },
    { t: "ফলাফল যাচাই", d: "ফলাফল কর্মকর্তা ভোট গণনা মিলিয়ে যাচাই করবেন", when: election?.results_verified_at ? fmtDateTime(election.results_verified_at) : null, icon: Gavel },
    { t: "অফিসিয়াল ফলাফল", d: "ডাউনলোডযোগ্য প্রতিবেদনসহ প্রকাশ", when: election?.results_published_at ? fmtDateTime(election.results_published_at) : null, icon: Trophy },
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
        <span className="font-display pointer-events-none absolute -bottom-16 -left-6 -z-10 select-none text-[16rem] font-bold leading-none text-transparent [-webkit-text-stroke:1px_rgb(201_162_74/0.18)] sm:text-[22rem]" aria-hidden>২৮</span>

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-28 sm:px-6 sm:pt-32 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-36">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
              <span className="h-px w-8 bg-gold" /> {settings.institution}
            </p>
            <h1 className="font-display mt-6 text-[2.6rem] font-bold leading-[1.12] sm:text-6xl lg:text-[4.2rem]">
              আপনার ব্যাচ,
              <br />
              আপনার <span className="relative inline-block text-gold-gradient">কণ্ঠ<svg className="absolute -bottom-2 left-0 h-3 w-full text-gold/70" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden><path d="M2 9 Q 50 1 98 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>।
            </h1>
            <p className="font-display mt-5 text-xl text-white/90 sm:text-2xl">সিআর নির্বাচন <span className="text-gold-300">২০২৬</span> · টেকটাইটানস-২৮</p>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300 sm:text-base">
              {election?.description?.trim() ||
                `${settings.batch}-এর হয়ে কথা বলবেন যিনি, সেই ক্লাস রিপ্রেজেন্টেটিভকে বেছে নিন। একজন যাচাইকৃত শিক্ষার্থী, একটি গোপন ব্যালট — সিলগালা, নিরীক্ষিত ও স্বচ্ছ।`}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl" className="group bg-gold text-navy shadow-[0_14px_40px_-14px_rgb(201_162_74/0.9)] hover:bg-gold-300">
                <Link href="/vote">
                  <Vote /> {votingOpen ? "ভোট দেওয়া শুরু করুন" : "ভোটার পোর্টাল খুলুন"}
                  <ArrowRight className="transition group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="border-white/20 bg-white/5 text-white backdrop-blur hover:bg-white/10">
                <Link href={status === "RESULTS_PUBLISHED" ? "/results" : "#candidates"}>
                  {status === "RESULTS_PUBLISHED" ? <><Trophy /> অফিসিয়াল ফলাফল</> : <><Users /> প্রার্থীদের দেখুন</>}
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
                  {candidates.length > 5 && <span className="flex size-9 items-center justify-center rounded-full border-2 border-navy bg-white/15 text-[11px] font-bold text-white">+{bnNum(candidates.length - 5)}</span>}
                </span>
                <span className="text-sm leading-tight">
                  <span className="block font-semibold text-white">{bnNum(candidates.length)} জন প্রার্থী</span>
                  <span className="block text-xs text-slate-400 transition group-hover:text-gold-300">সবার পরিচিতি দেখুন →</span>
                </span>
              </Link>
            )}
          </div>

          {/* Arched window onto the campus — after the arches of the university gate */}
          <div className="relative mx-auto w-full max-w-[420px] animate-fade-up [animation-delay:150ms] lg:mr-0">
            <div className="relative aspect-[4/5] overflow-hidden rounded-b-[2rem] rounded-t-[999px] border border-gold/50 p-2 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]">
              <div className="relative size-full overflow-hidden rounded-b-[1.6rem] rounded-t-[999px]">
                <Image src="/campus/aerial.jpg" alt="ইসলামী বিশ্ববিদ্যালয় ক্যাম্পাসের আকাশ থেকে তোলা দৃশ্য" fill priority sizes="(min-width:1024px) 420px, 90vw" className="ken-burns object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/20 to-transparent" />
              </div>
            </div>
            <Image src="/campus/logo.png" alt="" width={72} height={68} className="absolute left-1/2 top-0 size-16 -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-2xl ring-4 ring-navy" aria-hidden />

            <div className="glass relative -mt-28 mx-3 rounded-3xl p-5 sm:mx-6 sm:p-6">
              {countdown ? (
                <Countdown target={countdown.target} serverNow={serverNow} label={countdown.label} dark />
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">নির্বাচনের অবস্থা</p>
                  <p className="font-display mt-2 text-2xl font-bold">{status ? STATUS_LABEL[status] : "এখনো ঘোষণা হয়নি"}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {status === "RESULTS_PUBLISHED" ? "নির্বাচন কমিটি অফিসিয়াল ফলাফল প্রকাশ করেছে।" : status === "CLOSED" ? "ভোটগ্রহণ শেষ হয়েছে। যাচাইয়ের পর ফলাফল প্রকাশ করা হবে।" : "নির্বাচন কমিটি এখানে সময়সূচি ঘোষণা করবে।"}
                  </p>
                </div>
              )}
              {status === "PAUSED" && <p className="mt-4 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-200">নির্বাচন কমিটি সাময়িকভাবে ভোটগ্রহণ স্থগিত রেখেছে।</p>}
              {turnout && (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <LiveTurnout initial={turnout} live={status === "LIVE"} dark />
                </div>
              )}
            </div>
          </div>
        </div>

        <ul className="relative mx-auto -mt-6 flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-3 px-4 pb-10 text-xs font-medium text-slate-400 sm:px-6 lg:justify-start">
          {[[ShieldCheck, "ওটিপি-যাচাইকৃত ভোটার"], [EyeOff, "গোপন ব্যালট"], [Lock, "ভোট শেষে ফলাফল"], [FileClock, "কারচুপি-প্রতিরোধী অডিট লগ"]].map(([Icon, label]) => {
            const I = Icon as typeof ShieldCheck;
            return <li key={label as string} className="flex items-center gap-2"><I className="size-4 text-gold-300" />{label as string}</li>;
          })}
        </ul>
        <div className="hairline-gold" aria-hidden />
      </section>

      {/* ───────────── TRUST MARQUEE ───────────── */}
      <div className="border-b border-line bg-surface py-5">
        <Marquee
          className="text-sm font-medium text-slate-500"
          items={[
            "ইসলামী বিশ্ববিদ্যালয়, বাংলাদেশ", "তথ্য ও যোগাযোগ প্রযুক্তি বিভাগ", `${settings.batch}`, "একজন শিক্ষার্থী · একটি ব্যালট", "গোপন ও যাচাইযোগ্য", "শেষ পর্যন্ত সিলগালা",
            "মোবাইলেই ভোট", "হ্যাশ-চেইনড অডিট ট্রেইল", "স্বাধীন নির্বাচন কমিটি",
          ].map((t) => <><span className="size-1.5 rotate-45 bg-gold" />{t}</>)}
        />
      </div>

      {/* ───────────── CAMPUS ───────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6" aria-label="আমাদের ক্যাম্পাস">
        <Heading eyebrow="ইসলামী বিশ্ববিদ্যালয় · কুষ্টিয়া" title="এক ক্যাম্পাস। এক কণ্ঠ।" subtitle="কৃষ্ণচূড়ার ছায়ায় ঘেরা আমাদের বিশ্ববিদ্যালয়ে আইসিটির ২৮তম ব্যাচ বেছে নেবে তাদের কণ্ঠস্বর।" />
        <div className="mt-12 grid gap-4 md:grid-cols-6 md:grid-rows-2">
          <figure className="reveal group relative min-h-64 overflow-hidden rounded-3xl shadow-lift md:col-span-4 md:row-span-2 md:min-h-[26rem]">
            <Image src="/campus/aerial.jpg" alt="আকাশ থেকে ইসলামী বিশ্ববিদ্যালয় ক্যাম্পাস" fill sizes="(min-width:768px) 66vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-transparent" />
            <figcaption className="font-display absolute bottom-5 left-6 text-2xl text-white">লাল ইটের ক্যাম্পাস</figcaption>
          </figure>
          <figure className="reveal reveal-delay-1 group relative min-h-44 overflow-hidden rounded-3xl shadow-lift md:col-span-2">
            <Image src="/campus/gate.jpg" alt="ফুটন্ত কৃষ্ণচূড়ার নিচে প্রধান ফটক" fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-transparent" />
            <figcaption className="font-display absolute bottom-4 left-5 text-lg text-white">প্রধান ফটক</figcaption>
          </figure>
          <figure className="reveal reveal-delay-2 group relative min-h-44 overflow-hidden rounded-3xl shadow-lift md:col-span-2">
            <Image src="/campus/building.jpg" alt="কৃষ্ণচূড়ায় ঘেরা একাডেমিক ভবন" fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-transparent" />
            <figcaption className="font-display absolute bottom-4 left-5 text-lg text-white">যেখানে আমরা শিখি</figcaption>
          </figure>
        </div>
      </section>

      {/* ───────────── LIVE STATS ───────────── */}
      {turnout && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-label="এক নজরে নির্বাচন">
          <div className="reveal grid gap-px overflow-hidden rounded-3xl border border-line bg-line shadow-elite sm:grid-cols-4">
            {[
              { k: "যোগ্য ভোটার", v: turnout.eligible, s: "" },
              { k: "ভোট পড়েছে", v: turnout.voted, s: "" },
              { k: "ভোটার উপস্থিতি", v: turnout.turnoutPct, s: "%", d: 1 },
              { k: "প্রার্থী", v: candidates.length, s: "" },
            ].map((x) => (
              <div key={x.k} className="bg-surface px-6 py-7 text-center">
                <p className="text-4xl font-extrabold tracking-tight sm:text-5xl"><AnimatedNumber value={x.v} suffix={x.s} decimals={x.d ?? 0} /></p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{x.k}</p>
              </div>
            ))}
          </div>
          {election && (
            <p className="mt-4 text-center text-xs text-muted">ভোটগ্রহণের সময়: {fmtDateTime(election.opens_at)} – {fmtDateTime(election.closes_at)} (বাংলাদেশ সময়)</p>
          )}
        </section>
      )}

      {/* ───────────── CANDIDATES ───────────── */}
      <section id="candidates" className="relative scroll-mt-24 overflow-hidden py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Heading eyebrow="পদ · ক্লাস রিপ্রেজেন্টেটিভ" title="প্রার্থীদের সাথে পরিচিত হোন" subtitle="নির্বাচন কমিটি কর্তৃক অনুমোদিত। তালিকার ক্রম কোনো র‍্যাঙ্কিং নির্দেশ করে না।" />
          {candidates.length === 0 ? (
            <div className="mt-12 rounded-3xl border border-dashed border-line bg-surface p-14 text-center text-muted">নির্বাচন কমিটি প্রার্থীদের নাম ঘোষণা করবে।</div>
          ) : (
            <CandidateGrid candidates={candidates.map((c) => ({ id: c.id, display_name: c.display_name, roll_number: c.roll_number, introduction: c.introduction, photo_url: c.photo_url }))} />
          )}
        </div>
      </section>

      {/* ───────────── HOW IT WORKS ───────────── */}
      <section id="how-it-works" className="noise relative isolate scroll-mt-24 overflow-hidden bg-emerald-900 py-20 text-white sm:py-24">
        <Image src="/campus/building.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover opacity-25 mix-blend-luminosity" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-900/90 to-navy/95" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <Heading dark eyebrow="চারটি ধাপ · প্রায় দুই মিনিট" title="দুই মিনিটেই ভোট দিন" subtitle="আপনার ফোনের জন্যই তৈরি। কোনো অ্যাপ, অ্যাকাউন্ট বা পাসওয়ার্ড লাগবে না।" />
          <ol className="relative mt-16 grid gap-5 md:grid-cols-4">
            <div className="absolute left-[12%] right-[12%] top-7 hidden h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent md:block" aria-hidden />
            {[
              { icon: Fingerprint, t: "রোল নম্বর দিন", d: "আপনার বিশ্ববিদ্যালয় রোল নম্বর লিখুন।" },
              { icon: KeyRound, t: "কোড যাচাই করুন", d: "নিবন্ধিত ইমেইল বা ফোনে ৬ অঙ্কের একটি যাচাই কোড যাবে।" },
              { icon: Vote, t: "বেছে নিন ও নিশ্চিত করুন", d: "একজন প্রার্থী বেছে নিন, আরেকবার দেখে নিশ্চিত করুন।" },
              { icon: ReceiptText, t: "রসিদ রেখে দিন", d: "রসিদ আইডি প্রমাণ করে আপনার ভোট গণনায় এসেছে — কাকে দিয়েছেন তা নয়।" },
            ].map(({ icon: Icon, t, d }, i) => (
              <li key={t} className={cn("reveal relative text-center", `reveal-delay-${i}`)}>
                <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald to-emerald-900 ring-1 ring-gold/50 shadow-glow">
                  <Icon className="size-6" aria-hidden />
                  <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-navy bg-white text-[11px] font-bold text-navy">{bnNum(i + 1)}</span>
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
        <Heading eyebrow="নকশাতেই আস্থা" title="কাউকে অন্ধভাবে বিশ্বাস করতে হয় না" subtitle="নিয়মগুলো শুধু ওয়েবসাইটে নয় — সরাসরি ডেটাবেসের ভেতরেই কার্যকর করা হয়।" />
        <div className="mt-14 grid gap-4 md:grid-cols-6">
          {[
            { icon: Lock, t: "একজন, একটি ভোট", d: "রো-লক ও ইউনিক কনস্ট্রেইন্টের কারণে দ্বিতীয় ব্যালট দেওয়া অসম্ভব — একসাথে হাজারো অনুরোধ এলেও।", span: "md:col-span-3", tone: "from-emerald-50 to-white" },
            { icon: EyeOff, t: "সত্যিকারের গোপন ব্যালট", d: "কে ভোট দিয়েছেন আর কী বেছে নিয়েছেন — এ দুটি আলাদা টেবিলে থাকে, তাদের মধ্যে কোনো সংযোগ নেই। রসিদে কখনো আপনার পছন্দ দেখা যায় না।", span: "md:col-span-3", tone: "from-amber-50 to-white" },
            { icon: ShieldCheck, t: "সিলগালা ফলাফল", d: "ভোটগ্রহণ শেষ না হওয়া পর্যন্ত প্রার্থীভিত্তিক গণনা করা যায় না।", span: "md:col-span-2", tone: "from-slate-50 to-white" },
            { icon: FileClock, t: "কারচুপি-প্রতিরোধী অডিট ট্রেইল", d: "প্রতিটি প্রশাসনিক কাজ হ্যাশ-চেইনড, শুধু-সংযোজনযোগ্য লগে লিপিবদ্ধ হয়।", span: "md:col-span-2", tone: "from-slate-50 to-white" },
            { icon: Gavel, t: "দুইজনের অনুমোদনে সংশোধন", d: "কোনো ব্যালট কখনো সম্পাদনা করা হয় না। সংশোধনের জন্য কারণ ও দ্বিতীয় একজন অ্যাডমিনের অনুমোদন লাগে।", span: "md:col-span-2", tone: "from-slate-50 to-white" },
          ].map(({ icon: Icon, t, d, span, tone }, i) => (
            <SpotlightCard key={t} className={cn("reveal rounded-3xl border border-line bg-gradient-to-br p-7 shadow-card", tone, span, `reveal-delay-${i % 3}`)}>
              <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-900 text-gold-300 shadow-lg shadow-navy/20"><Icon className="size-5" /></span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{d}</p>
            </SpotlightCard>
          ))}
        </div>
      </section>

      {/* ───────────── TIMELINE ───────────── */}
      <section className="border-y border-line bg-gradient-to-b from-white to-canvas py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Heading eyebrow="নির্বাচনের কার্যক্রম" title="সময়রেখা" subtitle="ঘোষণা থেকে অফিসিয়াল ফলাফল পর্যন্ত নির্বাচনের প্রতিটি ধাপ অনুসরণ করুন।" />
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
                    {current && <span className="rounded-full bg-electric-50 px-2.5 py-0.5 text-[11px] font-semibold text-electric-600">চলমান</span>}
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
            <Heading align="left" eyebrow="ভোট দেওয়ার আগে" title="নির্বাচনী নির্দেশিকা" subtitle="সিস্টেম ও নির্বাচন কমিটি উভয়েই এগুলো কার্যকর করে।" />
            <Button asChild size="lg" className="mt-8"><Link href="/vote">ভোটার পোর্টালে যান <ArrowRight /></Link></Button>
          </div>
          <div className="space-y-3">
            {[
              [`কারা ভোট দিতে পারবেন?`, `শুধু ${settings.batch}-এর নিবন্ধিত ও সক্রিয় শিক্ষার্থীরা। আপনার রোল নম্বর অফিসিয়াল তালিকায় থাকতে হবে।`],
              ["আমি কয়টি ভোট দিতে পারব?", "ঠিক একটি ব্যালট, একজন ক্লাস রিপ্রেজেন্টেটিভ প্রার্থীর জন্য। একবার জমা দিলে সেটিই চূড়ান্ত — অ্যাডমিনসহ কেউই তা বদলাতে পারেন না।"],
              ["আমার কোড আসেনি।", "এক মিনিট অপেক্ষা করে নতুন কোড চান এবং স্প্যাম ফোল্ডার দেখুন। নিবন্ধিত ফোন বা ইমেইল ভুল থাকলে সহায়তা পাতায় জানান, কমিটি তা সংশোধন করবে।"],
              ["কেউ কি জানতে পারবে আমি কাকে ভোট দিয়েছি?", "না। আপনার পরিচয় ও আপনার পছন্দ আলাদাভাবে সংরক্ষিত থাকে, তাদের মধ্যে কোনো সংযোগ নেই। রসিদ শুধু প্রমাণ করে ব্যালট জমা পড়েছে, তাতে কী ছিল তা নয়।"],
              ["আমার পরিচয় ব্যবহার করে কেউ ভোট দিয়েছে।", "সাথে সাথে সহায়তা পাতায় জানান। কমিটি সরাসরি তদন্ত করবে। অভিযোগ করলে বাড়তি কোনো ব্যালট তৈরি হয় না।"],
              ["আমি কি অন্য কারো হয়ে ভোট দিতে বা কোড শেয়ার করতে পারি?", "না। অন্যের হয়ে ভোট দেওয়া অসদাচরণ। যাচাই কোড কখনো কাউকে দেবেন না — কমিটির কেউ কখনো তা চাইবেন না।"],
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
            <Heading align="left" eyebrow="স্বাধীন তত্ত্বাবধান" title="নির্বাচন কমিটি" />
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
              <p className="mt-6 text-sm text-muted">ঘোষণার পর কমিটির সদস্যদের নাম এখানে দেখানো হবে।</p>
            )}
          </div>
          <div className="noise relative h-fit overflow-hidden rounded-3xl bg-navy p-7 text-white shadow-lift">
            <div className="aurora opacity-50" aria-hidden />
            <div className="relative">
              <LifeBuoy className="size-7 text-gold-300" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold">সাহায্য দরকার?</h3>
              <p className="mt-1.5 text-sm text-slate-400">কোড আসছে না, রোল নম্বর গ্রহণ করছে না, বা আপনার পরিচয়ের অপব্যবহারের সন্দেহ — কমিটিকে জানান।</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-200">
                {settings.contact.email && <li className="flex items-center gap-2.5"><Mail className="size-4 text-slate-400" /><a className="hover:text-white" href={`mailto:${settings.contact.email}`}>{settings.contact.email}</a></li>}
                {settings.contact.phone && <li className="flex items-center gap-2.5"><Phone className="size-4 text-slate-400" />{settings.contact.phone}</li>}
                {settings.contact.office && <li className="flex items-center gap-2.5"><MapPin className="size-4 text-slate-400" />{settings.contact.office}</li>}
                <li className="flex items-center gap-2.5"><Smartphone className="size-4 text-slate-400" />যেকোনো আধুনিক মোবাইল ব্রাউজারে চলে</li>
              </ul>
              <Button asChild className="mt-7 w-full bg-white text-navy hover:bg-slate-100"><Link href="/help">সমস্যা জানান</Link></Button>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── FINAL CTA ───────────── */}
      <section className="noise relative isolate overflow-hidden bg-navy py-24 text-center text-white">
        <Image src="/campus/aerial-wide.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy/95 via-emerald-900/85 to-navy/70" aria-hidden />
        <div className="relative mx-auto max-w-2xl px-4">
          <h2 className="font-display text-4xl font-bold sm:text-6xl">আপনার ভোট, <span className="text-gold-gradient">আপনার শক্তি</span>।</h2>
          <p className="mt-4 text-slate-300">{votingOpen ? "ভোটগ্রহণ চলছে। দুই মিনিটেরও কম সময় লাগবে।" : "নির্বাচন শুরু হলে ভোটার পোর্টাল খুলুন।"}</p>
          <Button asChild size="xl" className="mt-8 bg-gold text-navy shadow-xl shadow-black/30 hover:bg-gold-300">
            <Link href="/vote"><Vote /> {votingOpen ? "আপনার ভোট দিন" : "ভোটার পোর্টাল"} <ArrowRight /></Link>
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
