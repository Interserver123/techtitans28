"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, QrCode } from "lucide-react";
import { api } from "@/lib/client";
import { errorText } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "verify" | "enroll">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ qrDataUrl: string; secret: string } | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await api<{ next: "verify" | "enroll" }>("/api/admin/auth/login", { json: { email, password } });
    setBusy(false);
    if (!r.ok) return setError(errorText("bn", r.error));
    setPassword("");
    setStep(r.next);
    if (r.next === "enroll") {
      const s = await api<{ qrDataUrl: string; secret: string }>("/api/admin/auth/mfa-setup", { method: "POST" });
      if (s.ok) setEnroll(s); else setError(errorText("bn", s.error));
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await api<{ next: string }>("/api/admin/auth/mfa", { json: { code } });
    if (!r.ok) { setBusy(false); setCode(""); return setError(r.error.code === "UNAUTHENTICATED" ? "আপনার লগইনের মেয়াদ শেষ হয়েছে। আবার শুরু করুন।" : errorText("bn", r.error)); }
    router.replace(r.next);
    router.refresh();
  }

  if (step === "password") {
    return (
      <form onSubmit={login} className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">কমিটির লগইন</h1>
          <p className="mt-1 text-sm text-slate-400">নির্বাচন পরিচালনা ড্যাশবোর্ড</p>
        </div>
        <Field label="ইমেইল" htmlFor="email"><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="পাসওয়ার্ড" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>এগিয়ে যান</Button>
      </form>
    );
  }
  return (
    <form onSubmit={verify} className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          {step === "enroll" ? <QrCode className="size-5 text-gold-300" /> : <KeyRound className="size-5 text-gold-300" />}
          {step === "enroll" ? "দুই-ধাপের যাচাই চালু করুন" : "দুই-ধাপের যাচাই"}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {step === "enroll"
            ? "কমিটির অ্যাকাউন্টে দুই-ধাপের যাচাই বাধ্যতামূলক। Google Authenticator, Microsoft Authenticator বা যেকোনো TOTP অ্যাপ দিয়ে এই কিউআর কোডটি স্ক্যান করুন, তারপর ৬ অঙ্কের কোডটি লিখুন।"
            : "আপনার অথেনটিকেটর অ্যাপের ৬ অঙ্কের কোডটি লিখুন।"}
        </p>
      </div>
      {step === "enroll" && enroll && (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qrDataUrl} alt="দুই-ধাপের যাচাই চালুর কিউআর কোড" className="size-48" />
          <code className="break-all text-center text-[11px] text-slate-600">{enroll.secret}</code>
        </div>
      )}
      <Field label="যাচাই কোড" htmlFor="totp">
        <Input id="totp" value={code} onChange={(e) => setCode(e.target.value.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="h-12 text-center font-mono text-xl tracking-[0.4em]" autoFocus required />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" className="w-full" size="lg" loading={busy} disabled={code.length !== 6}>যাচাই করুন</Button>
      <button type="button" className="w-full text-center text-sm text-slate-400 hover:text-white" onClick={() => { setStep("password"); setError(null); }}>ফিরে যান</button>
    </form>
  );
}
