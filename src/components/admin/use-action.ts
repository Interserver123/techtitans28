"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "./toast";

/** Calls an admin API, shows a toast, refreshes server data on success. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T = Record<string, unknown>>(url: string, init: Parameters<typeof api>[1], success?: string) {
    setBusy(true);
    setError(null);
    const r = await api<T>(url, init);
    setBusy(false);
    if (!r.ok) {
      setError(r.error.message);
      toast("error", r.error.message);
      if (r.error.code === "UNAUTHENTICATED" || r.error.code === "MFA_REQUIRED") router.replace("/admin/login");
      return null;
    }
    if (success) toast("success", success);
    router.refresh();
    return r;
  }
  return { run, busy, error, setError };
}
