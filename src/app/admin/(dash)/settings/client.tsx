"use client";
import { useState } from "react";
import { CheckCircle2, Mail, Plus, Send, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useAction } from "@/components/admin/use-action";

/** Shows whether verification emails are switched on and sends a sample to confirm delivery. */
export function EmailCheck({ status }: { status: { mode: string; email: boolean; sms: boolean } }) {
  const [to, setTo] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const ready = status.mode === "live" && status.email;
  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 font-semibold text-white"><Mail className="size-4 text-gold" /> ইমেইলে যাচাই কোড</p>
          <p className={`mt-2 flex items-center gap-2 text-sm ${ready ? "text-green-400" : "text-amber-300"}`}>
            {ready ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {ready ? "চালু আছে — শিক্ষার্থীরা নিবন্ধিত ইমেইলে কোড পাবেন।" : status.mode !== "live" ? "বন্ধ — OTP_PROVIDER এখনো \"live\" নয়, তাই কোনো কোড পাঠানো হচ্ছে না।" : "বন্ধ — ইমেইল সার্ভারের (SMTP) তথ্য দেওয়া হয়নি।"}
          </p>
          <p className="mt-1 text-xs text-slate-500">ভোট শুরুর আগে নিজের ইমেইলে একটি পরীক্ষামূলক কোড (০০০০০০) পাঠিয়ে দেখে নিন যে ইমেইল পৌঁছাচ্ছে। স্প্যাম ফোল্ডারও দেখুন।</p>
        </div>
        <form className="flex w-full gap-2 lg:max-w-sm" onSubmit={async (e) => { e.preventDefault(); setSent(null); if (await run("/api/admin/settings/test-email", { json: { to } }, "পরীক্ষামূলক ইমেইল পাঠানো হয়েছে")) setSent(to); }}>
          <Input type="email" required placeholder="আপনার ইমেইল" aria-label="পরীক্ষামূলক ইমেইলের ঠিকানা" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
          <Button type="submit" loading={busy} className="h-10 shrink-0"><Send /> পাঠান</Button>
        </form>
      </div>
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      {sent && !error && <Alert tone="success" className="mt-4">{sent}-এ পরীক্ষামূলক ইমেইল পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন।</Alert>}
    </Card>
  );
}

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

/** Welcome message every voter sees on the page after voting. {name} = voter's name, {roll} = roll number. */
export function WelcomeForm({ initial, defaultText }: { initial: string; defaultText: string }) {
  const [msg, setMsg] = useState(initial);
  const { run, busy, error } = useAction();
  return (
    <Card className="mt-6 p-5">
      <p className="font-semibold text-white">ভোট শেষে স্বাগত বার্তা</p>
      <p className="mt-1 text-xs text-slate-500">ভোট দেওয়ার পর প্রত্যেক ভোটার এই বার্তাটি দেখবেন। <code>{"{name}"}</code> লিখলে ভোটারের নাম এবং <code>{"{roll}"}</code> লিখলে রোল নম্বর বসে যাবে। ফাঁকা রাখলে ডিফল্ট বার্তা দেখাবে।</p>
      <form className="mt-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); await run("/api/admin/settings/welcome", { method: "PUT", json: { message: msg } }, "স্বাগত বার্তা সংরক্ষিত হয়েছে"); }}>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={600} rows={4} placeholder={defaultText}
          className="w-full rounded-xl border border-line bg-transparent p-3 text-sm text-white outline-none focus:border-gold" aria-label="স্বাগত বার্তা" />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{msg.length}/600</span>
          <Button type="submit" loading={busy}>বার্তা সংরক্ষণ করুন</Button>
        </div>
      </form>
    </Card>
  );
}
