"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useAction } from "@/components/admin/use-action";

type S = { committee: { name: string; designation: string; contact: string }[]; contact: { email: string; phone: string; office: string } };

export function SettingsForm({ initial }: { initial: S }) {
  const [f, setF] = useState<S>(initial);
  const { run, busy, error } = useAction();
  return (
    <form className="grid gap-6 lg:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await run("/api/admin/settings", { method: "PUT", json: f }, "Settings saved"); }}>
      <Card className="space-y-4 p-5">
        <p className="font-semibold text-white">Election Committee members</p>
        {f.committee.map((m, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input aria-label="Name" placeholder="Name" value={m.name} onChange={(e) => { const c = [...f.committee]; c[i] = { ...m, name: e.target.value }; setF({ ...f, committee: c }); }} required />
            <Input aria-label="Designation" placeholder="Designation" value={m.designation} onChange={(e) => { const c = [...f.committee]; c[i] = { ...m, designation: e.target.value }; setF({ ...f, committee: c }); }} required />
            <Button type="button" size="icon" variant="ghost" aria-label="Remove member" onClick={() => setF({ ...f, committee: f.committee.filter((_, j) => j !== i) })}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setF({ ...f, committee: [...f.committee, { name: "", designation: "", contact: "" }] })}><Plus /> Add member</Button>
      </Card>
      <Card className="space-y-4 p-5">
        <p className="font-semibold text-white">Public help-desk contact</p>
        <Field label="Email" htmlFor="ce"><Input id="ce" type="email" value={f.contact.email} onChange={(e) => setF({ ...f, contact: { ...f.contact, email: e.target.value } })} /></Field>
        <Field label="Phone" htmlFor="cp"><Input id="cp" value={f.contact.phone} onChange={(e) => setF({ ...f, contact: { ...f.contact, phone: e.target.value } })} /></Field>
        <Field label="Office" htmlFor="co"><Input id="co" value={f.contact.office} onChange={(e) => setF({ ...f, contact: { ...f.contact, office: e.target.value } })} /></Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" loading={busy}>Save settings</Button>
      </Card>
    </form>
  );
}
