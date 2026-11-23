"use client";
import { useState } from "react";
import { FilePlus2, Gavel, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useAction } from "@/components/admin/use-action";

export function NewCorrection({ electionId }: { electionId: string }) {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const [f, setF] = useState({ ballotRef: "", correction: "INVALIDATE_BALLOT", reason: "", evidenceNote: "" });
  const [file, setFile] = useState<File | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><FilePlus2 /> নতুন সংশোধনের অনুরোধ</Button></DialogTrigger>
      <DialogContent title="সংশোধনের অনুরোধ" description="বেনামি ব্যালট লেজারে (ফলাফল → ব্যালট লেজার) ব্যালট রেফারেন্স খুঁজুন। দ্বিতীয় একজন অ্যাডমিনকে অনুমোদন দিতে হবে। (ভোটের প্রার্থী পরিবর্তনের অনুরোধ সুপার অ্যাডমিন 'ভোটের রেকর্ড' পাতা থেকে করেন।)">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData();
          Object.entries({ ...f, electionId }).forEach(([k, v]) => fd.set(k, v));
          if (file) fd.set("evidence", file);
          const r = await run("/api/admin/corrections", { form: fd }, "সংশোধনের অনুরোধ অনুমোদনের জন্য জমা হয়েছে");
          if (r) { setOpen(false); setF({ ballotRef: "", correction: "INVALIDATE_BALLOT", reason: "", evidenceNote: "" }); setFile(null); }
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ব্যালট রেফারেন্স" htmlFor="br"><Input id="br" placeholder="B-XXXXXXXXXXXXXXXX" value={f.ballotRef} onChange={(e) => setF({ ...f, ballotRef: e.target.value.toUpperCase() })} required className="font-mono" maxLength={18} /></Field>
            <Field label="সংশোধন" htmlFor="ct"><Select id="ct" value={f.correction} onChange={(e) => setF({ ...f, correction: e.target.value })}><option value="INVALIDATE_BALLOT">ব্যালট বাতিল</option><option value="REINSTATE_BALLOT">ব্যালট পুনর্বহাল</option></Select></Field>
          </div>
          <Field label="কারণ (আবশ্যক, অন্তত ২০ অক্ষর)" htmlFor="rs"><Textarea id="rs" rows={4} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required minLength={20} maxLength={2000} /></Field>
          <Field label="প্রমাণের বিবরণ" htmlFor="en"><Textarea id="en" rows={2} value={f.evidenceNote} onChange={(e) => setF({ ...f, evidenceNote: e.target.value })} maxLength={2000} /></Field>
          <Field label="সংযুক্তি (ঐচ্ছিক)" htmlFor="ef" hint="PDF, JPEG, PNG বা WebP · সর্বোচ্চ ৫ MB"><Input id="ef" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-2" /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>অনুমোদনের জন্য জমা দিন</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewCorrection({ id, kind }: { id: string; kind?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { run, busy, error } = useAction();
  const submit = async (approve: boolean) => {
    const r = await run(`/api/admin/corrections/${id}/review`, { json: { approve, note } }, approve ? "সংশোধন অনুমোদিত ও কার্যকর হয়েছে" : "সংশোধন প্রত্যাখ্যাত হয়েছে");
    if (r) setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Gavel /> পর্যালোচনা</Button></DialogTrigger>
      <DialogContent title="সংশোধন পর্যালোচনা" description={kind === "REPLACE_CHOICE"
        ? "অনুমোদন দিলে মূল ব্যালট বাতিল চিহ্নিত হয় (মুছে ফেলা হয় না) এবং অনুরোধ করা প্রার্থীর জন্য একটি যুক্ত নতুন ব্যালট যোগ হয়। সিদ্ধান্তটি অপরিবর্তনীয়ভাবে লিপিবদ্ধ হয় এবং ভোটার তার রসিদ পাতায় জানতে পারেন।"
        : "অনুমোদন দিলে ব্যালটের অবস্থা বদলায় (বিষয়বস্তু কখনো নয়) এবং তা অপরিবর্তনীয়ভাবে লিপিবদ্ধ হয়।"}>
        <div className="space-y-4">
          <Field label="পর্যালোচনার নোট" htmlFor="rn"><Textarea id="rn" rows={3} value={note} onChange={(e) => setNote(e.target.value)} minLength={5} maxLength={2000} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="danger" loading={busy} disabled={note.trim().length < 5} onClick={() => submit(false)}>প্রত্যাখ্যান</Button>
            <Button variant="success" loading={busy} disabled={note.trim().length < 5} onClick={() => submit(true)}>অনুমোদন</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CancelCorrection({ id }: { id: string }) {
  const { run, busy } = useAction();
  return <Button size="sm" variant="outline" loading={busy} onClick={() => { if (confirm("এই সংশোধনের অনুরোধ প্রত্যাহার করবেন?")) void run(`/api/admin/corrections/${id}/cancel`, { method: "POST" }, "অনুরোধ প্রত্যাহার করা হয়েছে"); }}><Undo2 /> প্রত্যাহার</Button>;
}
