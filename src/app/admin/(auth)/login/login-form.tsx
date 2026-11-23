"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, QrCode } from "lucide-react";
import { api } from "@/lib/client";
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
    if (!r.ok) return setError(r.error.message);
    setPassword("");
    setStep(r.next);
    if (r.next === "enroll") {
      const s = await api<{ qrDataUrl: string; secret: string }>("/api/admin/auth/mfa-setup", { method: "POST" });
      if (s.ok) setEnroll(s); else setError(s.error.message);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await api<{ next: string }>("/api/admin/auth/mfa", { json: { code } });
    if (!r.ok) { setBusy(false); setCode(""); return setError(r.error.code === "UNAUTHENTICATED" ? "Your sign-in expired. Start again." : r.error.message); }
    router.replace(r.next);
    router.refresh();
  }

  if (step === "password") {
    return (
      <form onSubmit={login} className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Committee sign-in</h1>
          <p className="mt-1 text-sm text-slate-400">Election administration dashboard</p>
        </div>
        <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>Continue</Button>
      </form>
    );
  }
  return (
    <form onSubmit={verify} className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          {step === "enroll" ? <QrCode className="size-5 text-blue-400" /> : <KeyRound className="size-5 text-blue-400" />}
          {step === "enroll" ? "Set up two-factor authentication" : "Two-factor verification"}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {step === "enroll"
            ? "MFA is mandatory for committee accounts. Scan this QR code with Google Authenticator, Microsoft Authenticator or any TOTP app, then enter the 6-digit code."
            : "Enter the 6-digit code from your authenticator app."}
        </p>
      </div>
      {step === "enroll" && enroll && (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qrDataUrl} alt="MFA enrolment QR code" className="size-48" />
          <code className="break-all text-center text-[11px] text-slate-600">{enroll.secret}</code>
        </div>
      )}
      <Field label="Authentication code" htmlFor="totp">
        <Input id="totp" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="h-12 text-center font-mono text-xl tracking-[0.4em]" autoFocus required />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" className="w-full" size="lg" loading={busy} disabled={code.length !== 6}>Verify</Button>
      <button type="button" className="w-full text-center text-sm text-slate-400 hover:text-white" onClick={() => { setStep("password"); setError(null); }}>Back</button>
    </form>
  );
}
