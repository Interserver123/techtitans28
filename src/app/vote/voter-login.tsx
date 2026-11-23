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
    if (code.length !== 6) return setError("৬ অঙ্কের কোডটি লিখুন।");
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
        {["রোল নম্বর", "যাচাই", "ব্যালট"].map((s, i) => (
          <div key={s} className={`flex flex-1 items-center justify-center gap-2 py-3 ${i === (step === "roll" ? 0 : 1) ? "text-electric" : "text-muted"}`}>
            <span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${i <= (step === "roll" ? 0 : 1) ? "bg-electric text-white" : "bg-slate-100"}`}>{"১২৩"[i]}</span>
            <span className="hidden sm:inline">{s}</span>
          </div>
        ))}
      </div>
      <div className="p-5 sm:p-7">
        {step === "roll" ? (
          <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }} className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold">আপনার বিশ্ববিদ্যালয় রোল নম্বর লিখুন</h2>
              <p className="mt-1 text-sm text-muted">বিভাগে নিবন্ধিত আপনার ইমেইল বা ফোনে আমরা একটি যাচাই কোড পাঠাব।</p>
            </div>
            <Field label="রোল নম্বর" htmlFor="roll">
              <Input id="roll" value={roll} onChange={(e) => setRoll(e.target.value.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).toUpperCase().replace(/\s/g, ""))} inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="যেমন 2518013" maxLength={20} required className="h-12 text-lg font-semibold tracking-wide" />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="xl" className="w-full bg-gradient-to-r from-emerald to-emerald-900 shadow-glow hover:brightness-110" loading={busy} disabled={roll.length < 3}>যাচাই কোড পাঠান <ArrowRight /></Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-5">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold"><KeyRound className="size-5 text-electric" /> আপনার কোডটি লিখুন</h2>
              <p className="mt-1 text-sm text-muted">রোল <strong className="text-ink">{roll}</strong></p>
            </div>
            {notice && (
              <div className="flex gap-3 rounded-xl bg-electric-50 p-3 text-sm text-emerald-900"><MessageSquareText className="size-4 shrink-0 mt-0.5" /> {notice}</div>
            )}
            <Field label="৬ অঙ্কের কোড" htmlFor="otp" hint="কোডটি ৫ মিনিট পর মেয়াদোত্তীর্ণ হবে। কখনো কাউকে দেবেন না।">
              <Input
                id="otp" ref={otpRef} value={code}
                onChange={(e) => { const v = e.target.value.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/\D/g, "").slice(0, 6); setCode(v); }}
                inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="••••••"
                className="h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]" required
              />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="xl" className="w-full bg-gradient-to-r from-emerald to-emerald-900 shadow-glow hover:brightness-110" loading={busy} disabled={code.length !== 6}>যাচাই করে এগিয়ে যান <ArrowRight /></Button>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
              <button type="button" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink" onClick={() => { setStep("roll"); setError(null); }}>
                <ArrowLeft className="size-4" /> রোল নম্বর বদলান
              </button>
              <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="font-medium text-electric disabled:text-muted">
                {cooldown > 0 ? `${String(cooldown).replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)])} সেকেন্ড পর আবার চাইতে পারবেন` : "আবার কোড পাঠান"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
