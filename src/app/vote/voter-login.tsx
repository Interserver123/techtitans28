"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, KeyRound, MessageSquareText } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function VoterLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"roll" | "otp">("roll");
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

  async function sendCode() {
    setBusy(true); setError(null);
    const r = await api<{ message: string }>("/api/vote/request-otp", { json: { roll } });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setNotice(r.message);
    setStep("otp");
    setCode("");
    setCooldown(60);
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length !== 6) return setError("Enter the 6-digit code.");
    setBusy(true); setError(null);
    const r = await api<{ next: string }>("/api/vote/verify-otp", { json: { code } });
    if (!r.ok) {
      setBusy(false);
      setError(r.error.message);
      if (r.error.code === "OTP_LOCKED") setCode("");
      return;
    }
    router.replace(r.next);
    router.refresh();
  }

  return (
    <Card className="overflow-hidden rounded-3xl shadow-elite">
      <div className="flex border-b border-line bg-gradient-to-b from-slate-50 to-white text-xs font-semibold">
        {["Roll number", "Verification", "Ballot"].map((s, i) => (
          <div key={s} className={`flex flex-1 items-center justify-center gap-2 py-3 ${i === (step === "roll" ? 0 : 1) ? "text-electric" : "text-muted"}`}>
            <span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${i <= (step === "roll" ? 0 : 1) ? "bg-electric text-white" : "bg-slate-100"}`}>{i + 1}</span>
            <span className="hidden sm:inline">{s}</span>
          </div>
        ))}
      </div>
      <div className="p-5 sm:p-7">
        {step === "roll" ? (
          <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }} className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Enter your university roll number</h2>
              <p className="mt-1 text-sm text-muted">We&apos;ll send a one-time code to the email or phone registered with the department.</p>
            </div>
            <Field label="Roll number" htmlFor="roll">
              <Input id="roll" value={roll} onChange={(e) => setRoll(e.target.value.toUpperCase().replace(/\s/g, ""))} inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="e.g. 2128001" maxLength={20} required className="h-12 text-lg font-semibold tracking-wide" />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="xl" className="w-full bg-gradient-to-r from-emerald to-emerald-900 shadow-glow hover:brightness-110" loading={busy} disabled={roll.length < 3}>Send verification code <ArrowRight /></Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-5">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold"><KeyRound className="size-5 text-electric" /> Enter your code</h2>
              <p className="mt-1 text-sm text-muted">Roll <strong className="text-ink">{roll}</strong></p>
            </div>
            {notice && (
              <div className="flex gap-3 rounded-xl bg-electric-50 p-3 text-sm text-emerald-900"><MessageSquareText className="size-4 shrink-0 mt-0.5" /> {notice}</div>
            )}
            <Field label="6-digit code" htmlFor="otp" hint="The code expires in 5 minutes. Never share it.">
              <Input
                id="otp" ref={otpRef} value={code}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); }}
                inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="••••••"
                className="h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]" required
              />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="xl" className="w-full bg-gradient-to-r from-emerald to-emerald-900 shadow-glow hover:brightness-110" loading={busy} disabled={code.length !== 6}>Verify &amp; continue <ArrowRight /></Button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink" onClick={() => { setStep("roll"); setError(null); }}>
                <ArrowLeft className="size-4" /> Change roll
              </button>
              <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="font-medium text-electric disabled:text-muted">
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
