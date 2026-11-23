"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { api } from "@/lib/client";
import { errorText } from "@/lib/i18n";

/**
 * Step-up MFA: sensitive admin actions (voter-linked vote records, correction requests and reviews,
 * record exports) need a fresh authenticator code. The server answers STEP_UP_REQUIRED; this provider
 * asks for the code once, then the caller retries.
 */
type Ctx = { stepUp: () => Promise<boolean> };
const StepUpContext = createContext<Ctx>({ stepUp: async () => false });
export const useStepUp = () => useContext(StepUpContext);

export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const stepUp = useCallback(() => new Promise<boolean>((resolve) => {
    pending.current?.(false);
    pending.current = resolve;
    setCode("");
    setError(null);
    setOpen(true);
  }), []);

  const finish = (ok: boolean) => {
    pending.current?.(ok);
    pending.current = null;
    setOpen(false);
  };

  return (
    <StepUpContext.Provider value={{ stepUp }}>
      {children}
      <Dialog open={open} onOpenChange={(o) => { if (!o) finish(false); }}>
        <DialogContent title="পরিচয় পুনরায় নিশ্চিত করুন" description="এটি একটি সংবেদনশীল কাজ। অথেনটিকেটর অ্যাপের বর্তমান ৬ অঙ্কের কোডটি লিখুন। নিশ্চিতকরণ ১০ মিনিট বৈধ থাকবে এবং অডিট লগে লেখা হবে।">
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const r = await api("/api/admin/auth/step-up", { json: { code } });
            setBusy(false);
            if (r.ok) finish(true);
            else { setError(errorText("bn", r.error)); setCode(""); }
          }}>
            <Field label="যাচাই কোড" htmlFor="stepup-code">
              <Input id="stepup-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center font-mono text-lg tracking-[0.4em]" required />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}><ShieldCheck /> নিশ্চিত করুন</Button>
          </form>
        </DialogContent>
      </Dialog>
    </StepUpContext.Provider>
  );
}

/** For server-rendered pages whose data needs a fresh code: ask for it, then re-render. */
export function StepUpGate({ message }: { message: string }) {
  const { stepUp } = useStepUp();
  const router = useRouter();
  return (
    <div className="rounded-2xl border border-gold/25 bg-gold/[0.04] p-6 text-center">
      <KeyRound className="mx-auto size-8 text-gold-300" aria-hidden />
      <p className="mx-auto mt-3 max-w-lg text-sm text-slate-300">{message}</p>
      <Button className="mt-4" onClick={async () => { if (await stepUp()) router.refresh(); }}><ShieldCheck /> কোড দিয়ে নিশ্চিত করুন</Button>
    </div>
  );
}

function filenameFrom(res: Response, fallback: string) {
  const m = res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/);
  return m?.[1] ?? fallback;
}

/** Downloads an authorised export; handles the step-up prompt and shows errors instead of a JSON page. */
export function DownloadButton({ href, fallbackName = "export", children, onError, ...props }: Omit<ButtonProps, "onClick" | "onError"> & { href: string; fallbackName?: string; onError?: (message: string) => void }) {
  const { stepUp } = useStepUp();
  const [busy, setBusy] = useState(false);
  const download = async (retried = false): Promise<void> => {
    setBusy(true);
    try {
      const res = await fetch(href, { credentials: "same-origin", cache: "no-store" });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok && type.includes("application/json")) {
        const body = await res.json().catch(() => null) as { error?: { code: string; message: string } } | null;
        const err = body?.error ?? { code: "INTERNAL", message: `HTTP ${res.status}` };
        if (err.code === "STEP_UP_REQUIRED" && !retried) {
          setBusy(false);
          if (await stepUp()) return download(true);
          return;
        }
        const msg = errorText("bn", err);
        if (onError) onError(msg); else alert(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFrom(res, fallbackName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      const msg = "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন।";
      if (onError) onError(msg); else alert(msg);
    } finally {
      setBusy(false);
    }
  };
  return <Button type="button" loading={busy} onClick={() => void download()} {...props}>{children}</Button>;
}
