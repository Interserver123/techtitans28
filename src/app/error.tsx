"use client";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <AlertTriangle className="mx-auto size-10 text-warning" />
        <h1 className="mt-4 text-xl font-semibold">The election portal is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-muted">Please try again in a moment. If this continues, contact the Election Committee.</p>
        <button onClick={() => retry()} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-electric px-5 text-sm font-semibold text-white hover:bg-electric-600">
          <RotateCcw className="size-4" /> Try again
        </button>
        <p className="mt-6 text-xs text-muted">
          Administrators: open <Link href="/api/health" className="font-medium text-electric underline">/api/health</Link> to see which setting or setup step is missing.
          {digest && <><br />Reference: <code>{digest}</code></>}
        </p>
      </div>
    </div>
  );
}
