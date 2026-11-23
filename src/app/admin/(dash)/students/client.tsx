"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileUp, Link2, Pencil, Power, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/admin/use-action";
import { api } from "@/lib/client";
import { errorText } from "@/lib/i18n";
import { bnNum, fmtDateTime } from "@/lib/format";
import { useToast } from "@/components/admin/toast";

type S = { id?: string; rollNumber: string; fullName: string; contactType: "EMAIL" | "PHONE"; contactValue: string; batch: string; gender: "MALE" | "FEMALE" | ""; isEligible: boolean; isActive: boolean; notes: string };

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
        <Input placeholder="নাম বা রোল দিয়ে খুঁজুন…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="h-10 pl-9" aria-label="শিক্ষার্থী খুঁজুন" />
      </div>
      <Select className="h-10 sm:w-40" value={f.voted} aria-label="ভোটের অবস্থা" onChange={(e) => { const n = { ...f, voted: e.target.value }; setF(n); apply(n); }}>
        <option value="">ভোটের সব অবস্থা</option><option value="yes">ভোট দিয়েছেন</option><option value="no">ভোট দেননি</option>
      </Select>
      <Select className="h-10 sm:w-40" value={f.status} aria-label="অ্যাকাউন্টের অবস্থা" onChange={(e) => { const n = { ...f, status: e.target.value }; setF(n); apply(n); }}>
        <option value="">সব অবস্থা</option><option value="active">সক্রিয় ও যোগ্য</option><option value="inactive">নিষ্ক্রিয়</option><option value="ineligible">অযোগ্য</option>
      </Select>
      <Button type="submit" size="default" variant="subtle" className="h-10">খুঁজুন</Button>
    </form>
  );
}

export function StudentDialog({ student, batch }: { student?: S; batch: string }) {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const [f, setF] = useState<S>(student ?? { rollNumber: "", fullName: "", contactType: "EMAIL", contactValue: "", batch, gender: "", isEligible: true, isActive: true, notes: "" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{student ? <Button size="icon" variant="ghost" aria-label={`${student.fullName} সম্পাদনা`}><Pencil /></Button> : <Button size="sm"><UserPlus /> শিক্ষার্থী যোগ করুন</Button>}</DialogTrigger>
      <DialogContent title={student ? "শিক্ষার্থীর তথ্য সম্পাদনা" : "শিক্ষার্থী যোগ করুন"} description="পরিবর্তনগুলো অডিট লগে লিপিবদ্ধ হয়।">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = student ? await run(`/api/admin/students/${student.id}`, { method: "PATCH", json: { ...f, gender: f.gender || null } }, "শিক্ষার্থীর তথ্য হালনাগাদ হয়েছে") : await run("/api/admin/students", { json: { ...f, gender: f.gender || null } }, "শিক্ষার্থী যোগ হয়েছে");
          if (r) setOpen(false);
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="রোল নম্বর" htmlFor="sr"><Input id="sr" value={f.rollNumber} onChange={(e) => setF({ ...f, rollNumber: e.target.value.toUpperCase() })} required maxLength={20} /></Field>
            <Field label="ব্যাচ" htmlFor="sb"><Input id="sb" value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} required maxLength={40} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="পূর্ণ নাম" htmlFor="sn"><Input id="sn" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required maxLength={120} /></Field>
            <Field label="লিঙ্গ" htmlFor="sg" hint="প্রার্থী হলে ছাত্র/ছাত্রী সিআর নির্ধারণ করে।">
              <Select id="sg" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as S["gender"] })}>
                <option value="">— নির্ধারিত নয় —</option><option value="MALE">ছাত্র</option><option value="FEMALE">ছাত্রী</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field label="যোগাযোগের ধরন" htmlFor="sct"><Select id="sct" value={f.contactType} onChange={(e) => setF({ ...f, contactType: e.target.value as S["contactType"] })}><option value="EMAIL">ইমেইল</option><option value="PHONE">ফোন</option></Select></Field>
            <Field label="নিবন্ধিত যোগাযোগ" htmlFor="sc" hint="এখানেই ওটিপি কোড পাঠানো হবে।"><Input id="sc" value={f.contactValue} onChange={(e) => setF({ ...f, contactValue: e.target.value })} required maxLength={254} /></Field>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-slate-200">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isEligible} onChange={(e) => setF({ ...f, isEligible: e.target.checked })} className="size-4 accent-[#0f7a4f]" /> ভোট দেওয়ার যোগ্য</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="size-4 accent-[#0f7a4f]" /> অ্যাকাউন্ট সক্রিয়</label>
          </div>
          <Field label="মন্তব্য" htmlFor="snotes"><Textarea id="snotes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>{student ? "সংরক্ষণ করুন" : "শিক্ষার্থী যোগ করুন"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { run, busy } = useAction();
  return (
    <Button size="icon" variant="ghost" loading={busy} aria-label={active ? "নিষ্ক্রিয় করুন" : "আবার সক্রিয় করুন"} title={active ? "নিষ্ক্রিয় করুন" : "আবার সক্রিয় করুন"}
      onClick={() => { if (confirm(active ? "এই শিক্ষার্থীকে নিষ্ক্রিয় করবেন? তিনি আর ভোট দিতে পারবেন না।" : "এই শিক্ষার্থীকে আবার সক্রিয় করবেন?")) void run(`/api/admin/students/${id}/active`, { json: { active: !active } }, active ? "শিক্ষার্থী নিষ্ক্রিয় করা হয়েছে" : "শিক্ষার্থী আবার সক্রিয় করা হয়েছে"); }}>
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
    if (!r.ok) return setError(errorText("bn", r.error));
    setPreview(r);
    if (commit && r.committed) {
      toast("success", `ইমপোর্ট সম্পন্ন: ${bnNum(r.committed.inserted)} জন যোগ, ${bnNum(r.committed.updated)} জন হালনাগাদ, ${bnNum(r.committed.skipped)} জন বাদ`);
      router.refresh();
      setOpen(false);
      setPreview(null); setFile(null);
    }
  }
  const problems = preview?.rows.filter((r) => r.errors.length || r.warnings.length) ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPreview(null); setError(null); } }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><FileUp /> ইমপোর্ট</Button></DialogTrigger>
      <DialogContent wide title="শিক্ষার্থী ইমপোর্ট" description={<>CSV বা Excel (.xlsx) ফাইল আপলোড করুন। কলাম: <code>roll_number, full_name, contact</code> (ইমেইল বা ফোন); ঐচ্ছিক: <code>gender</code> (male/female বা ছাত্র/ছাত্রী), <code>batch</code> (ডিফল্ট {batch}), <code>eligible</code>, <code>active</code>, <code>notes</code>।</>}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Input type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} className="h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-electric file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
            <Select value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setPreview(null); }} aria-label="ইমপোর্টের ধরন">
              <option value="insert_only">শুধু নতুন যোগ</option><option value="upsert">নতুন যোগ ও পুরোনো হালনাগাদ</option>
            </Select>
          </div>
          <Button onClick={() => send(false)} disabled={!file} loading={busy && !preview} variant="subtle" className="w-full">ফাইল যাচাই করুন</Button>
          {error && <Alert tone="error">{error}</Alert>}
          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge>{bnNum(preview.summary.total)}টি সারি</Badge><Badge tone="green">{bnNum(preview.summary.inserts)}টি নতুন</Badge><Badge tone="blue">{bnNum(preview.summary.updates)}টি হালনাগাদ</Badge>
                <Badge tone="neutral">{bnNum(preview.summary.skips)}টি বাদ</Badge><Badge tone={preview.summary.invalid ? "red" : "green"}>{bnNum(preview.summary.invalid)}টি ত্রুটিপূর্ণ</Badge>
              </div>
              {problems.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10">
                  <table className="w-full text-xs"><thead className="sticky top-0 bg-navy-700 text-left text-slate-400"><tr><th className="px-3 py-2">সারি</th><th className="px-3 py-2">রোল</th><th className="px-3 py-2">সমস্যা</th></tr></thead>
                    <tbody className="divide-y divide-white/5">
                      {problems.map((r) => (
                        <tr key={r.row}><td className="px-3 py-2 font-mono text-slate-300">{r.row}</td><td className="px-3 py-2 font-mono text-slate-300">{r.rollNumber ?? "—"}</td>
                          <td className="px-3 py-2">{r.errors.map((e) => <p key={e} className="text-red-300">✕ {e}</p>)}{r.warnings.map((w) => <p key={w} className="text-amber-300">! {w}</p>)}</td></tr>
                      ))}
                    </tbody></table>
                </div>
              )}
              {preview.summary.invalid > 0
                ? <Alert tone="error">ত্রুটিপূর্ণ সারিগুলো ঠিক করে আবার যাচাই করুন। কিছুই ইমপোর্ট করা হয়নি।</Alert>
                : <Button className="w-full" onClick={() => send(true)} loading={busy}>{bnNum(preview.summary.inserts + preview.summary.updates)}টি রেকর্ড ইমপোর্ট করুন</Button>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type LinkRow = { id: string; created_at: string; expires_at: string; first_used_at: string | null; revoked_at: string | null; reason: string | null; expired: boolean };

/** Gives one student a private, time-limited voting link (no email code; the student confirms their roll number). */
export function AccessLinkDialog({ studentId, name, roll, hasVoted }: { studentId: string; name: string; roll: string; hasVoted: boolean }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("6");
  const [reason, setReason] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [copied, setCopied] = useState(false);
  const { run, busy, error } = useAction();
  const toast = useToast();

  async function load() {
    const r = await api<{ links: LinkRow[] }>(`/api/admin/students/${studentId}/access-link`);
    if (r.ok) setLinks(r.links);
  }
  async function create() {
    const r = await run<{ url: string }>(`/api/admin/students/${studentId}/access-link`, { json: { hours: Number(hours), reason } }, "লিংক তৈরি হয়েছে");
    if (r && r.ok) { setUrl(r.url); setCopied(false); void load(); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url ?? ""); setCopied(true); } catch { toast("error", "কপি করা যায়নি — লিংকটি নিজে সিলেক্ট করে কপি করুন।"); }
  }
  async function revoke(id: string) {
    if (!confirm("এই লিংকটি বাতিল করবেন? এটি দিয়ে আর ভোট দেওয়া যাবে না।")) return;
    const r = await run(`/api/admin/access-links/${id}`, { method: "DELETE" }, "লিংক বাতিল হয়েছে");
    if (r) { setUrl(null); void load(); }
  }
  const status = (l: LinkRow) => l.revoked_at ? <Badge tone="red">বাতিল</Badge> : l.expired ? <Badge tone="amber">মেয়াদ শেষ</Badge> : l.first_used_at ? <Badge tone="blue">ব্যবহৃত</Badge> : <Badge tone="green">সক্রিয়</Badge>;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setUrl(null); void load(); } }}>
      <DialogTrigger asChild><Button size="icon" variant="ghost" aria-label={`${name}-এর ভোটিং লিংক`} title="ব্যক্তিগত ভোটিং লিংক"><Link2 /></Button></DialogTrigger>
      <DialogContent title="ব্যক্তিগত ভোটিং লিংক" description={`${name} (রোল ${roll}) — ইমেইল কোড ছাড়াই শুধু রোল নম্বর দিয়ে ভোট দেওয়ার লিংক।`}>
        {hasVoted ? <Alert tone="info">এই শিক্ষার্থী ইতিমধ্যে ভোট দিয়েছেন।</Alert> : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="মেয়াদ" htmlFor="al-h">
                <Select id="al-h" value={hours} onChange={(e) => setHours(e.target.value)}>
                  <option value="2">২ ঘণ্টা</option><option value="6">৬ ঘণ্টা</option><option value="24">২৪ ঘণ্টা</option><option value="72">৭২ ঘণ্টা</option>
                </Select>
              </Field>
              <Field label="কারণ (ঐচ্ছিক)" htmlFor="al-r"><Input id="al-r" value={reason} maxLength={300} placeholder="যেমন: ইমেইল অ্যাক্সেস নেই" onChange={(e) => setReason(e.target.value)} /></Field>
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Button className="w-full" loading={busy} onClick={() => void create()}><Link2 /> নতুন লিংক তৈরি করুন</Button>
            {url && (
              <div className="space-y-2 rounded-xl border border-gold/40 bg-white/5 p-3">
                <p className="text-xs text-amber-300">লিংকটি এখনই কপি করে শিক্ষার্থীকে পাঠান — এটি আর দেখানো হবে না। নতুন লিংক তৈরি করলে আগেরটি বাতিল হবে।</p>
                <div className="flex gap-2"><Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label="ভোটিং লিংক" /><Button type="button" variant="outline" onClick={() => void copy()}><Copy /> {copied ? "কপি হয়েছে" : "কপি"}</Button></div>
              </div>
            )}
          </div>
        )}
        {links.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold text-slate-400">আগের লিংক</p>
            <ul className="divide-y divide-white/5 text-xs text-slate-300">
              {links.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{fmtDateTime(l.created_at)} → {fmtDateTime(l.expires_at)}{l.reason ? ` · ${l.reason}` : ""}</span>
                  <span className="flex items-center gap-2">{status(l)}{!l.revoked_at && !l.expired && <Button size="sm" variant="ghost" onClick={() => void revoke(l.id)}>বাতিল</Button>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
