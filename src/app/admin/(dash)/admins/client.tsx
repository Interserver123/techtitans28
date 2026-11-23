"use client";
import { useState } from "react";
import { KeyRound, Pencil, ShieldOff, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useAction } from "@/components/admin/use-action";

const ROLES = [["SUPER_ADMIN", "সুপার অ্যাডমিন"], ["ELECTION_ADMIN", "নির্বাচন অ্যাডমিন"], ["RESULTS_OFFICER", "ফলাফল কর্মকর্তা"], ["AUDITOR", "নিরীক্ষক"]];

export function AdminDialog() {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const [f, setF] = useState({ email: "", fullName: "", designation: "", role: "ELECTION_ADMIN", canPublishResults: false, password: "" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><UserPlus /> অ্যাডমিন যোগ করুন</Button></DialogTrigger>
      <DialogContent title="অ্যাডমিন যোগ করুন" description="অস্থায়ী পাসওয়ার্ডটি নিরাপদে (সরাসরি) জানান। নতুন অ্যাডমিনকে প্রথম লগইনে দুই-ধাপের যাচাই চালু করতে হবে।">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run("/api/admin/admins", { json: f }, "অ্যাডমিন যোগ হয়েছে")) setOpen(false); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="পূর্ণ নাম" htmlFor="an"><Input id="an" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></Field>
            <Field label="পদবি" htmlFor="ad"><Input id="ad" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} placeholder="যেমন প্রধান নির্বাচন কমিশনার" /></Field>
          </div>
          <Field label="ইমেইল" htmlFor="ae"><Input id="ae" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="ভূমিকা" htmlFor="ar"><Select id="ar" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          {f.role === "RESULTS_OFFICER" && <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.canPublishResults} onChange={(e) => setF({ ...f, canPublishResults: e.target.checked })} className="size-4 accent-[#0f7a4f]" /> ফলাফল প্রকাশের অনুমতি আছে</label>}
          <Field label="অস্থায়ী পাসওয়ার্ড" htmlFor="ap" hint="অন্তত ১২ অক্ষর; বড় ও ছোট হাতের ইংরেজি অক্ষর এবং অঙ্ক থাকতে হবে।"><Input id="ap" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={12} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>অ্যাডমিন তৈরি করুন</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type A = { id: string; fullName: string; designation: string; role: string; canPublishResults: boolean; isActive: boolean };

export function AdminActions({ admin }: { admin: A }) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const { run, busy, error } = useAction();
  const [f, setF] = useState(admin);
  return (
    <div className="flex justify-end gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="icon" variant="ghost" aria-label="সম্পাদনা"><Pencil /></Button></DialogTrigger>
        <DialogContent title={`${admin.fullName} সম্পাদনা`} description="ভূমিকা বদলালে বা নিষ্ক্রিয় করলে ব্যবহারকারী সব ডিভাইস থেকে লগআউট হয়ে যাবেন।">
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(`/api/admin/admins/${admin.id}`, { method: "PATCH", json: f }, "অ্যাডমিনের তথ্য হালনাগাদ হয়েছে")) setOpen(false); }}>
            <Field label="পূর্ণ নাম" htmlFor="en"><Input id="en" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></Field>
            <Field label="পদবি" htmlFor="ed"><Input id="ed" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field>
            <Field label="ভূমিকা" htmlFor="er"><Select id="er" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            {f.role === "RESULTS_OFFICER" && <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.canPublishResults} onChange={(e) => setF({ ...f, canPublishResults: e.target.checked })} className="size-4 accent-[#0f7a4f]" /> ফলাফল প্রকাশের অনুমতি আছে</label>}
            <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="size-4 accent-[#0f7a4f]" /> অ্যাকাউন্ট সক্রিয়</label>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full" loading={busy}>সংরক্ষণ করুন</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogTrigger asChild><Button size="icon" variant="ghost" aria-label="পাসওয়ার্ড রিসেট" title="পাসওয়ার্ড রিসেট"><KeyRound /></Button></DialogTrigger>
        <DialogContent title="পাসওয়ার্ড রিসেট">
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(`/api/admin/admins/${admin.id}/reset-password`, { json: { password: pw } }, "পাসওয়ার্ড রিসেট হয়েছে")) { setPwOpen(false); setPw(""); } }}>
            <Field label="নতুন অস্থায়ী পাসওয়ার্ড" htmlFor="np"><Input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={12} /></Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full" loading={busy}>পাসওয়ার্ড রিসেট করুন</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Button size="icon" variant="ghost" aria-label="দুই-ধাপের যাচাই রিসেট" title="দুই-ধাপের যাচাই রিসেট" onClick={() => { if (confirm(`${admin.fullName}-এর দুই-ধাপের যাচাই রিসেট করবেন? তাঁকে আবার চালু করতে হবে।`)) void run(`/api/admin/admins/${admin.id}/reset-mfa`, { method: "POST" }, "দুই-ধাপের যাচাই রিসেট হয়েছে"); }}><ShieldOff /></Button>
    </div>
  );
}
