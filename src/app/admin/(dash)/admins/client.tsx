"use client";
import { useState } from "react";
import { KeyRound, Pencil, ShieldOff, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useAction } from "@/components/admin/use-action";

const ROLES = [["SUPER_ADMIN", "Super Admin"], ["ELECTION_ADMIN", "Election Admin"], ["RESULTS_OFFICER", "Results Officer"], ["AUDITOR", "Auditor"]];

export function AdminDialog() {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const [f, setF] = useState({ email: "", fullName: "", designation: "", role: "ELECTION_ADMIN", canPublishResults: false, password: "" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><UserPlus /> Add administrator</Button></DialogTrigger>
      <DialogContent title="Add administrator" description="Share the temporary password securely (in person). The new admin must enrol MFA at first sign-in.">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run("/api/admin/admins", { json: f }, "Administrator added")) setOpen(false); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="an"><Input id="an" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></Field>
            <Field label="Designation" htmlFor="ad"><Input id="ad" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} placeholder="e.g. Chief Election Commissioner" /></Field>
          </div>
          <Field label="Email" htmlFor="ae"><Input id="ae" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Role" htmlFor="ar"><Select id="ar" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          {f.role === "RESULTS_OFFICER" && <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.canPublishResults} onChange={(e) => setF({ ...f, canPublishResults: e.target.checked })} className="size-4 accent-[#3B82F6]" /> Authorised to publish results</label>}
          <Field label="Temporary password" htmlFor="ap" hint="12+ characters with upper/lower-case letters and digits."><Input id="ap" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={12} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>Create administrator</Button>
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
        <DialogTrigger asChild><Button size="icon" variant="ghost" aria-label="Edit"><Pencil /></Button></DialogTrigger>
        <DialogContent title={`Edit ${admin.fullName}`} description="Role changes and deactivation sign the user out everywhere.">
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(`/api/admin/admins/${admin.id}`, { method: "PATCH", json: f }, "Administrator updated")) setOpen(false); }}>
            <Field label="Full name" htmlFor="en"><Input id="en" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></Field>
            <Field label="Designation" htmlFor="ed"><Input id="ed" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field>
            <Field label="Role" htmlFor="er"><Select id="er" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            {f.role === "RESULTS_OFFICER" && <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.canPublishResults} onChange={(e) => setF({ ...f, canPublishResults: e.target.checked })} className="size-4 accent-[#3B82F6]" /> Authorised to publish results</label>}
            <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="size-4 accent-[#3B82F6]" /> Account active</label>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full" loading={busy}>Save</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogTrigger asChild><Button size="icon" variant="ghost" aria-label="Reset password" title="Reset password"><KeyRound /></Button></DialogTrigger>
        <DialogContent title="Reset password">
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(`/api/admin/admins/${admin.id}/reset-password`, { json: { password: pw } }, "Password reset")) { setPwOpen(false); setPw(""); } }}>
            <Field label="New temporary password" htmlFor="np"><Input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={12} /></Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full" loading={busy}>Reset password</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Button size="icon" variant="ghost" aria-label="Reset MFA" title="Reset MFA" onClick={() => { if (confirm(`Reset MFA for ${admin.fullName}? They must enrol again.`)) void run(`/api/admin/admins/${admin.id}/reset-mfa`, { method: "POST" }, "MFA reset"); }}><ShieldOff /></Button>
    </div>
  );
}
