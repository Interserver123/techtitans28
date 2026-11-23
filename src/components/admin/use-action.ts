"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { errorText } from "@/lib/i18n";
import { useToast } from "./toast";
import { useStepUp } from "./step-up";

/** Calls an admin API, shows a toast, refreshes server data on success. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const { stepUp } = useStepUp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T = Record<string, unknown>>(url: string, init: Parameters<typeof api>[1], success?: string) {
    setBusy(true);
    setError(null);
    let r = await api<T>(url, init);
    // Sensitive action: ask for a fresh authenticator code once, then retry.
    if (!r.ok && r.error.code === "STEP_UP_REQUIRED" && (await stepUp())) r = await api<T>(url, init);
    setBusy(false);
    if (!r.ok) {
      setError(errorText("bn", r.error));
      toast("error", errorText("bn", r.error));
      if (r.error.code === "UNAUTHENTICATED" || r.error.code === "MFA_REQUIRED") router.replace("/admin/login");
      return null;
    }
    if (success) toast("success", success);
    router.refresh();
    return r;
  }
  return { run, busy, error, setError };
}
