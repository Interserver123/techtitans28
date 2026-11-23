"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { dict, errorText, type Lang } from "@/lib/i18n";

export function DisputeForm({ categories, lang = "en" }: { categories: Record<string, string>; lang?: Lang }) {
  const F = dict(lang).help.form;
  const [form, setForm] = useState({ rollNumber: "", reporterName: "", reporterContact: "", category: "TECHNICAL", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  if (ref) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h2 className="mt-4 text-xl font-semibold">{F.received}</h2>
        <p className="mt-1 text-sm text-muted">{F.ref}</p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-wider">{ref}</p>
        <p className="mt-4 text-sm text-muted">{F.contactBack}</p>
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
          if (r.ok) setRef(r.reference); else setError(errorText(lang, r.error));
        }}
      >
        <Field label={F.what} htmlFor="category">
          <Select id="category" value={form.category} onChange={set("category")}>
            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={F.name} htmlFor="name"><Input id="name" value={form.reporterName} onChange={set("reporterName")} required maxLength={120} autoComplete="name" /></Field>
          <Field label={F.roll} htmlFor="roll" hint={F.optional}><Input id="roll" value={form.rollNumber} onChange={set("rollNumber")} maxLength={20} autoComplete="off" /></Field>
        </div>
        <Field label={F.reach} htmlFor="contact"><Input id="contact" value={form.reporterContact} onChange={set("reporterContact")} required maxLength={254} /></Field>
        <Field label={F.details} htmlFor="desc" hint={F.noCodes}><Textarea id="desc" rows={5} value={form.description} onChange={set("description")} required minLength={10} maxLength={3000} /></Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full" size="lg">{F.submit}</Button>
      </form>
    </Card>
  );
}
