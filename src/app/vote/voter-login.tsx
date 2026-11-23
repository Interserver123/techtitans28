"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, AtSign, KeyRound, MessageSquareText, Phone, UserRound } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { VoterError } from "@/components/site/voter-error";
import { UrgentContact } from "@/components/site/urgent-contact";
import { dict, errorText, num, type Lang } from "@/lib/i18n";

/** Bengali keyboards type ০-৯; roll numbers and codes are stored with ASCII digits. */
const latinDigits = (v: string) => v.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));

export function VoterLogin({ lang = "en" }: { lang?: Lang }) {
  const V = dict(lang).vote;
  const router = useRouter();
  const [step, setStep] = useState<"roll" | "confirm" | "otp">("roll");
  const [who, setWho] = useState<{ fullName: string; contactType: "EMAIL" | "PHONE"; maskedContact: string; deliverable: boolean } | null>(null);
  const [roll, setRoll] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  /** Step 1: find the student behind the roll number and show who/where, before any code is sent. */
  async function lookup() {
    setBusy(true); setError(null);
    const r = await api<{ fullName: string; contactType: "EMAIL" | "PHONE"; maskedContact: string; deliverable: boolean }>("/api/vote/lookup", { json: { roll } });
    setBusy(false);
    if (!r.ok) return setError(errorText(lang, r.error));
    setWho(r);
    setStep("confirm");
  }

  async function sendCode() {
    setBusy(true); setError(null);
    const r = await api<{ message: string }>("/api/vote/request-otp", { json: { roll } });
    setBusy(false);
    if (!r.ok) return setError(errorText(lang, r.error));
    setNotice(who ? V.codeSent(who.maskedContact, who.contactType === "EMAIL") : lang === "bn" ? V.sent : r.message);
    setStep("otp");
    setCode("");
    setCooldown(60);
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length !== 6) return setError(V.enter6);
    setBusy(true); setError(null);
    const r = await api<{ next: string }>("/api/vote/verify-otp", { json: { code } });
    if (!r.ok) {
      setBusy(false);
      setError(errorText(lang, r.error));
      if (r.error.code === "OTP_LOCKED") setCode("");
      return;
    }
    router.replace(r.next);
    router.refresh();
  }

  return (
    <Card className="overflow-hidden rounded-3xl shadow-elite">
      <div className="flex border-b border-line bg-gradient-to-b from-slate-50 to-white text-xs font-semibold">
        {V.steps.map((s, i) => (
          <div key={s} className={`flex flex-1 items-center justify-center gap-2 py-3 ${i === (step === "otp" ? 1 : 0) ? "text-electric" : "text-muted"}`}>
            <span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${i <= (step === "otp" ? 1 : 0) ? "bg-electric text-white" : "bg-slate-100"}`}>{num(i + 1, lang)}</span>
            <span className="hidden sm:inline">{s}</span>
          </div>
        ))}
      </div>
      <div className="p-5 sm:p-7">
        {step === "roll" ? (
          <form onSubmit={(e) => { e.preventDefault(); void lookup(); }} className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">{V.rollTitle}</h2>
              <p className="mt-1 text-sm text-muted">{V.rollSub}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted">{dict("en").openBallot.notice} <Link href="/terms" className="font-semibold underline">{dict("en").openBallot.terms}</Link></p>
            <Field label={V.rollLabel} htmlFor="roll">
              <Input id="roll" value={roll} onChange={(e) => setRoll(latinDigits(e.target.value).toUpperCase().replace(/\s/g, ""))} inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={V.rollPh} maxLength={20} required className="h-12 text-lg font-semibold tracking-wide" />
            </Field>
            {error && <VoterError message={error} lang={lang} />}
            <Button type="submit" size="xl" className="w-full bg-gradient-to-r from-emerald to-emerald-900 shadow-glow hover:brightness-110" loading={busy} disabled={roll.length < 3}>{V.find} <ArrowRight /></Button>
          </form>
        ) : step === "confirm" && who ? (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">{V.confirmTitle}</h2>
            <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-b from-amber-50/60 to-white">
              <div className="flex items-center gap-3 p-4"><UserRound className="size-5 shrink-0 text-emerald-900" aria-hidden /><div><dt className="text-xs text-muted">{V.confirmName}</dt><dd className="text-lg font-bold" data-testid="who-name">{who.fullName}</dd></div></div>
              <div className="flex items-center gap-3 p-4"><span className="size-5 shrink-0 text-center text-xs font-bold text-emerald-900" aria-hidden>#</span><div><dt className="text-xs text-muted">{V.rollLabel}</dt><dd className="font-mono font-semibold">{roll}</dd></div></div>
              <div className="flex items-center gap-3 p-4">{who.contactType === "EMAIL" ? <AtSign className="size-5 shrink-0 text-emerald-900" aria-hidden /> : <Phone className="size-5 shrink-0 text-emerald-900" aria-hidden />}<div className="min-w-0"><dt className="text-xs text-muted">{who.contactType === "EMAIL" ? V.confirmEmail : V.confirmPhone}</dt><dd className="break-all font-mono text-[15px] font-semibold" data-testid="who-contact">{who.maskedContact}</dd></div></div>
            </dl>
            {who.deliverable
              ? <p className="text-sm text-slate-600">{V.codeWillGo(who.maskedContact)}</p>
              : <><Alert tone="warning">{V.cannotDeliver}</Alert><UrgentContact lang={lang} /></>}
            {error && <VoterError message={error} lang={lang} />}
            <Button size="xl" className="w-full bg-gradient-to-r from-emerald to-emerald-900 shadow-glow hover:brightness-110" loading={busy} disabled={!who.deliverable} onClick={() => void sendCode()}>
              {who.contactType === "EMAIL" ? V.sendHere : V.sendHerePhone} <ArrowRight />
            </Button>
            <button type="button" className="inline-flex w-full items-center justify-center gap-1 text-sm font-medium text-muted hover:text-ink" onClick={() => { setStep("roll"); setWho(null); setError(null); }}>
              <ArrowLeft className="size-4" /> {V.notMe}
            </button>
          </div>
        ) : (
          <form onSubmit={verify} className="space-y-5">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold"><KeyRound className="size-5 text-electric" /> {V.codeTitle}</h2>
              <p className="mt-1 text-sm text-muted">{V.rollShort} <strong className="text-ink">{roll}</strong></p>
            </div>
            {notice && (
              <div className="flex gap-3 rounded-xl bg-electric-50 p-3 text-sm text-emerald-900"><MessageSquareText className="size-4 shrink-0 mt-0.5" /> {notice}</div>
            )}
            <Field label={V.codeLabel} htmlFor="otp" hint={V.codeHint}>
              <Input
                id="otp" ref={otpRef} value={code}
                onChange={(e) => { const v = latinDigits(e.target.value).replace(/\D/g, "").slice(0, 6); setCode(v); }}
                inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="••••••"
                className="h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]" required
              />
            </Field>
            {error && <VoterError message={error} lang={lang} />}
            <Button type="submit" size="xl" className="w-full bg-gradient-to-r from-emerald to-emerald-900 shadow-glow hover:brightness-110" loading={busy} disabled={code.length !== 6}>{V.verify} <ArrowRight /></Button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink" onClick={() => { setStep("roll"); setWho(null); setError(null); }}>
                <ArrowLeft className="size-4" /> {V.changeRoll}
              </button>
              <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="font-medium text-electric disabled:text-muted">
                {cooldown > 0 ? V.resendIn(num(cooldown, lang)) : V.resend}
              </button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
