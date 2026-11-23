"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Pencil, Power, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/admin/use-action";
import { api } from "@/lib/client";
import { useToast } from "@/components/admin/toast";

type S = { id?: string; rollNumber: string; fullName: string; contactType: "EMAIL" | "PHONE"; contactValue: string; batch: string; isEligible: boolean; isActive: boolean; notes: string };

export function StudentFilters({ initial }: { initial: { q?: string; voted: string; status: string } }) {
  const router = useRouter();
  const [f, setF] = useState({ q: initial.q ?? "", voted: initial.voted, status: initial.status });
  const apply = (next = f) => {
    const p = new URLSearchParams();
    if (next.q) p.set("q", next.q);
    if (next.voted) p.set("voted", next.voted);
    if (next.status) p.set("status", next.status);
    router.push(`/admin/students?${p}`);
  };
  return (
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); apply(); }}>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <Input placeholder="Search name or roll…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="h-10 pl-9" aria-label="Search students" />
      </div>
      <Select className="h-10 sm:w-40" value={f.voted} aria-label="Voting status" onChange={(e) => { const n = { ...f, voted: e.target.value }; setF(n); apply(n); }}>
        <option value="">Any voting status</option><option value="yes">Voted</option><option value="no">Not voted</option>
      </Select>
      <Select className="h-10 sm:w-40" value={f.status} aria-label="Account status" onChange={(e) => { const n = { ...f, status: e.target.value }; setF(n); apply(n); }}>
        <option value="">Any status</option><option value="active">Active &amp; eligible</option><option value="inactive">Deactivated</option><option value="ineligible">Ineligible</option>
      </Select>
      <Button type="submit" size="default" variant="subtle" className="h-10">Search</Button>
    </form>
  );
}

export function StudentDialog({ student, batch }: { student?: S; batch: string }) {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const [f, setF] = useState<S>(student ?? { rollNumber: "", fullName: "", contactType: "EMAIL", contactValue: "", batch, isEligible: true, isActive: true, notes: "" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{student ? <Button size="icon" variant="ghost" aria-label={`Edit ${student.fullName}`}><Pencil /></Button> : <Button size="sm"><UserPlus /> Add student</Button>}</DialogTrigger>
      <DialogContent title={student ? "Edit student" : "Add student"} description="Changes are recorded in the audit log.">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = student ? await run(`/api/admin/students/${student.id}`, { method: "PATCH", json: f }, "Student updated") : await run("/api/admin/students", { json: f }, "Student added");
          if (r) setOpen(false);
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Roll number" htmlFor="sr"><Input id="sr" value={f.rollNumber} onChange={(e) => setF({ ...f, rollNumber: e.target.value.toUpperCase() })} required maxLength={20} /></Field>
            <Field label="Batch" htmlFor="sb"><Input id="sb" value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} required maxLength={40} /></Field>
          </div>
          <Field label="Full name" htmlFor="sn"><Input id="sn" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required maxLength={120} /></Field>
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field label="Contact type" htmlFor="sct"><Select id="sct" value={f.contactType} onChange={(e) => setF({ ...f, contactType: e.target.value as S["contactType"] })}><option value="EMAIL">Email</option><option value="PHONE">Phone</option></Select></Field>
            <Field label="Registered contact" htmlFor="sc" hint="OTP codes are sent here."><Input id="sc" value={f.contactValue} onChange={(e) => setF({ ...f, contactValue: e.target.value })} required maxLength={254} /></Field>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-slate-200">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isEligible} onChange={(e) => setF({ ...f, isEligible: e.target.checked })} className="size-4 accent-[#3B82F6]" /> Eligible to vote</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="size-4 accent-[#3B82F6]" /> Account active</label>
          </div>
          <Field label="Notes" htmlFor="snotes"><Textarea id="snotes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>{student ? "Save" : "Add student"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { run, busy } = useAction();
  return (
    <Button size="icon" variant="ghost" loading={busy} aria-label={active ? "Deactivate" : "Reactivate"} title={active ? "Deactivate" : "Reactivate"}
      onClick={() => { if (confirm(active ? "Deactivate this student? They will not be able to vote." : "Reactivate this student?")) void run(`/api/admin/students/${id}/active`, { json: { active: !active } }, active ? "Student deactivated" : "Student reactivated"); }}>
      <Power className={active ? "text-slate-400" : "text-green-400"} />
    </Button>
  );
}

type PreviewRow = { row: number; errors: string[]; warnings: string[]; action: string | null; rollNumber: string | null; fullName: string | null; contactType: string | null; batch: string | null };
type Preview = { summary: { total: number; valid: number; invalid: number; inserts: number; updates: number; skips: number }; rows: PreviewRow[]; committed?: { inserted: number; updated: number; skipped: number } };

export function ImportDialog({ batch }: { batch: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"insert_only" | "upsert">("insert_only");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(commit: boolean) {
    if (!file) return;
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.set("file", file); fd.set("mode", mode); fd.set("commit", String(commit));
    const r = await api<Preview>("/api/admin/students/import", { form: fd });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setPreview(r);
    if (commit && r.committed) {
      toast("success", `Imported: ${r.committed.inserted} added, ${r.committed.updated} updated, ${r.committed.skipped} skipped`);
      router.refresh();
      setOpen(false);
      setPreview(null); setFile(null);
    }
  }
  const problems = preview?.rows.filter((r) => r.errors.length || r.warnings.length) ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPreview(null); setError(null); } }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><FileUp /> Import</Button></DialogTrigger>
      <DialogContent wide title="Import students" description={<>Upload CSV or Excel (.xlsx). Columns: <code>roll_number, full_name, contact</code> (email or phone), optional <code>batch</code> (default {batch}), <code>eligible</code>, <code>active</code>, <code>notes</code>.</>}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Input type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} className="h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-electric file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
            <Select value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setPreview(null); }} aria-label="Import mode">
              <option value="insert_only">Add new only</option><option value="upsert">Add &amp; update existing</option>
            </Select>
          </div>
          <Button onClick={() => send(false)} disabled={!file} loading={busy && !preview} variant="subtle" className="w-full">Validate file</Button>
          {error && <Alert tone="error">{error}</Alert>}
          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge>{preview.summary.total} rows</Badge><Badge tone="green">{preview.summary.inserts} new</Badge><Badge tone="blue">{preview.summary.updates} updates</Badge>
                <Badge tone="neutral">{preview.summary.skips} skipped</Badge><Badge tone={preview.summary.invalid ? "red" : "green"}>{preview.summary.invalid} invalid</Badge>
              </div>
              {problems.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10">
                  <table className="w-full text-xs"><thead className="sticky top-0 bg-navy-700 text-left text-slate-400"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Issue</th></tr></thead>
                    <tbody className="divide-y divide-white/5">
                      {problems.map((r) => (
                        <tr key={r.row}><td className="px-3 py-2 font-mono text-slate-300">{r.row}</td><td className="px-3 py-2 font-mono text-slate-300">{r.rollNumber ?? "—"}</td>
                          <td className="px-3 py-2">{r.errors.map((e) => <p key={e} className="text-red-300">✕ {e}</p>)}{r.warnings.map((w) => <p key={w} className="text-amber-300">! {w}</p>)}</td></tr>
                      ))}
                    </tbody></table>
                </div>
              )}
              {preview.summary.invalid > 0
                ? <Alert tone="error">Fix the invalid rows and validate again. Nothing has been imported.</Alert>
                : <Button className="w-full" onClick={() => send(true)} loading={busy}>Import {preview.summary.inserts + preview.summary.updates} record(s)</Button>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
