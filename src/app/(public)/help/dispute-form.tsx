"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function DisputeForm({ categories }: { categories: Record<string, string> }) {
  const [form, setForm] = useState({ rollNumber: "", reporterName: "", reporterContact: "", category: "TECHNICAL", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  if (ref) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h2 className="mt-4 text-xl font-semibold">Report received</h2>
        <p className="mt-1 text-sm text-muted">Your reference number</p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-wider">{ref}</p>
        <p className="mt-4 text-sm text-muted">The Election Committee will contact you using the details you provided.</p>
      </Card>
    );
  }
  return (
    <Card className="p-6">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          const r = await api<{ reference: string }>("/api/public/dispute", { json: form });
          setBusy(false);
          if (r.ok) setRef(r.reference); else setError(r.error.message);
        }}
      >
        <Field label="What happened?" htmlFor="category">
          <Select id="category" value={form.category} onChange={set("category")}>
            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="name"><Input id="name" value={form.reporterName} onChange={set("reporterName")} required maxLength={120} autoComplete="name" /></Field>
          <Field label="Roll number" htmlFor="roll" hint="Optional"><Input id="roll" value={form.rollNumber} onChange={set("rollNumber")} maxLength={20} autoComplete="off" /></Field>
        </div>
        <Field label="Phone or email to reach you" htmlFor="contact"><Input id="contact" value={form.reporterContact} onChange={set("reporterContact")} required maxLength={254} /></Field>
        <Field label="Details" htmlFor="desc" hint="Do not include any one-time codes."><Textarea id="desc" rows={5} value={form.description} onChange={set("description")} required minLength={10} maxLength={3000} /></Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full" size="lg">Submit report</Button>
      </form>
    </Card>
  );
}
