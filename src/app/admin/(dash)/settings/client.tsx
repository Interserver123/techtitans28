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
    <form className="grid gap-6 lg:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await run("/api/admin/settings", { method: "PUT", json: f }, "সেটিংস সংরক্ষিত হয়েছে"); }}>
      <Card className="space-y-4 p-5">
        <p className="font-semibold text-white">নির্বাচন কমিটির সদস্য</p>
        {f.committee.map((m, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input aria-label="নাম" placeholder="নাম" value={m.name} onChange={(e) => { const c = [...f.committee]; c[i] = { ...m, name: e.target.value }; setF({ ...f, committee: c }); }} required />
            <Input aria-label="পদবি" placeholder="পদবি" value={m.designation} onChange={(e) => { const c = [...f.committee]; c[i] = { ...m, designation: e.target.value }; setF({ ...f, committee: c }); }} required />
            <Button type="button" size="icon" variant="ghost" aria-label="সদস্য সরান" onClick={() => setF({ ...f, committee: f.committee.filter((_, j) => j !== i) })}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setF({ ...f, committee: [...f.committee, { name: "", designation: "", contact: "" }] })}><Plus /> সদস্য যোগ করুন</Button>
      </Card>
      <Card className="space-y-4 p-5">
        <p className="font-semibold text-white">পাবলিক হেল্প ডেস্কের যোগাযোগ</p>
        <Field label="ইমেইল" htmlFor="ce"><Input id="ce" type="email" value={f.contact.email} onChange={(e) => setF({ ...f, contact: { ...f.contact, email: e.target.value } })} /></Field>
        <Field label="ফোন" htmlFor="cp"><Input id="cp" value={f.contact.phone} onChange={(e) => setF({ ...f, contact: { ...f.contact, phone: e.target.value } })} /></Field>
        <Field label="অফিস" htmlFor="co"><Input id="co" value={f.contact.office} onChange={(e) => setF({ ...f, contact: { ...f.contact, office: e.target.value } })} /></Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" loading={busy}>সেটিংস সংরক্ষণ করুন</Button>
      </Card>
    </form>
  );
}
