"use client";
import { useState } from "react";
import { BadgeCheck, SearchX } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { fmtDateTime } from "@/lib/format";

export function ReceiptVerifier() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { found: boolean; electionTitle?: string; votedAt?: string }>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="mt-8 p-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null); setResult(null);
          const r = await api<{ found: boolean; electionTitle?: string; votedAt?: string }>("/api/public/receipt", { json: { code } });
          setBusy(false);
          if (r.ok) setResult(r); else setError(r.error.message);
        }}
        className="space-y-4"
      >
        <Field label="রসিদ আইডি" htmlFor="receipt" hint="ফরম্যাট: TT28-XXXX-XXXX-XXXX">
          <Input id="receipt" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TT28-ABCD-EFGH-JKLM" autoComplete="off" spellCheck={false} className="font-mono tracking-wider" maxLength={19} required />
        </Field>
        <Button type="submit" loading={busy} className="w-full">রসিদ যাচাই করুন</Button>
      </form>
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      {result?.found && (
        <div className="mt-5 flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
          <BadgeCheck className="size-5 shrink-0" />
          <div className="text-sm"><p className="font-semibold">ব্যালট জমা হয়েছে</p><p>{result.electionTitle} · {fmtDateTime(result.votedAt)}</p></div>
        </div>
      )}
      {result && !result.found && (
        <div className="mt-5 flex gap-3 rounded-xl border border-line bg-slate-50 p-4 text-sm text-slate-700">
          <SearchX className="size-5 shrink-0" /> এই রসিদ আইডির সাথে কোনো ব্যালট মেলেনি। অক্ষরগুলো আবার মিলিয়ে দেখুন, অথবা নির্বাচন কমিটির সাথে যোগাযোগ করুন।
        </div>
      )}
    </Card>
  );
}
