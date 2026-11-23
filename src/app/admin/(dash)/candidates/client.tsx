"use client";
import { useRef, useState } from "react";
import { Camera, CheckCircle2, Eye, Pencil, PlusCircle, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CandidateAvatar } from "@/components/site/candidate-avatar";
import { bnNum } from "@/lib/format";
import { useAction } from "@/components/admin/use-action";

type C = { id: string; electionId: string; rollNumber: string; studentName: string; displayName: string; introduction: string; manifesto: string; photoUrl: string | null; status: string; displayOrder: number };

export function CandidateDialog({ electionId, candidate }: { electionId: string; candidate?: C }) {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const [f, setF] = useState({
    rollNumber: candidate?.rollNumber ?? "", displayName: candidate?.displayName ?? "", introduction: candidate?.introduction ?? "",
    manifesto: candidate?.manifesto ?? "", displayOrder: candidate?.displayOrder ?? 0,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{candidate ? <Button size="sm" variant="outline"><Pencil /> সম্পাদনা</Button> : <Button><PlusCircle /> প্রার্থী যোগ করুন</Button>}</DialogTrigger>
      <DialogContent wide title={candidate ? "প্রার্থীর তথ্য সম্পাদনা" : "প্রার্থী যোগ করুন"} description="নতুন প্রার্থী অনুমোদন না পাওয়া পর্যন্ত অপেক্ষমাণ থাকবেন।">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = candidate
            ? await run(`/api/admin/candidates/${candidate.id}`, { method: "PATCH", json: f }, "প্রার্থীর তথ্য হালনাগাদ হয়েছে")
            : await run("/api/admin/candidates", { json: { ...f, electionId } }, "প্রার্থী যোগ হয়েছে");
          if (r) setOpen(false);
        }}>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_110px]">
            <Field label="শিক্ষার্থীর রোল নম্বর" htmlFor="cr"><Input id="cr" value={f.rollNumber} onChange={(e) => setF({ ...f, rollNumber: e.target.value.toUpperCase() })} required maxLength={20} /></Field>
            <Field label="প্রদর্শিত নাম" htmlFor="cn"><Input id="cn" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required maxLength={120} /></Field>
            <Field label="ক্রম" htmlFor="co"><Input id="co" type="number" min={0} max={999} value={f.displayOrder} onChange={(e) => setF({ ...f, displayOrder: Number(e.target.value) })} /></Field>
          </div>
          <Field label="সংক্ষিপ্ত পরিচিতি" htmlFor="ci" hint={`${bnNum(f.introduction.length)}/৬০০`}><Textarea id="ci" rows={3} value={f.introduction} onChange={(e) => setF({ ...f, introduction: e.target.value })} maxLength={600} /></Field>
          <Field label="ইশতেহার" htmlFor="cm" hint={`${bnNum(f.manifesto.length)}/৬,০০০`}><Textarea id="cm" rows={8} value={f.manifesto} onChange={(e) => setF({ ...f, manifesto: e.target.value })} maxLength={6000} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>{candidate ? "সংরক্ষণ করুন" : "প্রার্থী যোগ করুন"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PhotoUpload({ id }: { id: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { run, busy } = useAction();
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.set("photo", file);
        await run(`/api/admin/candidates/${id}/photo`, { form: fd }, "ছবি হালনাগাদ হয়েছে");
        e.target.value = "";
      }} />
      <Button size="sm" variant="outline" loading={busy} onClick={() => ref.current?.click()}><Camera /> ছবি</Button>
    </>
  );
}

function Preview({ c }: { c: C }) {
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="ghost"><Eye /> প্রিভিউ</Button></DialogTrigger>
      <DialogContent title="পাবলিক প্রোফাইলের প্রিভিউ" className="!bg-white !text-ink">
        <div className="overflow-hidden rounded-2xl border border-line">
          <CandidateAvatar name={c.displayName} url={c.photoUrl} className="aspect-[4/3] w-full" />
          <div className="p-5">
            <p className="text-lg font-semibold">{c.displayName}</p>
            <p className="text-sm text-muted">রোল {c.rollNumber}</p>
            <p className="mt-3 text-sm text-slate-600">{c.introduction || "পরিচিতি নেই।"}</p>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700">{c.manifesto || "ইশতেহার নেই।"}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CandidateRow({ c, editable }: { c: C; editable: boolean }) {
  const { run, busy } = useAction();
  const tone = c.status === "APPROVED" ? "green" : c.status === "PENDING" ? "amber" : "red";
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <CandidateAvatar name={c.displayName} url={c.photoUrl} className="size-16 shrink-0 rounded-xl text-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{c.displayName}</p><Badge tone={tone}>{({ APPROVED: "অনুমোদিত", PENDING: "অপেক্ষমাণ", INACTIVE: "নিষ্ক্রিয়" } as Record<string, string>)[c.status] ?? c.status}</Badge></div>
        <p className="text-sm text-slate-400">রোল {c.rollNumber} · তালিকায় নাম: {c.studentName} · ক্রম {bnNum(c.displayOrder)}</p>
        <p className="mt-1 line-clamp-1 text-sm text-slate-500">{c.introduction || "এখনো পরিচিতি দেওয়া হয়নি।"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Preview c={c} />
        {editable && <>
          <PhotoUpload id={c.id} />
          <CandidateDialog electionId={c.electionId} candidate={c} />
          {c.status !== "APPROVED"
            ? <Button size="sm" variant="success" loading={busy} onClick={() => run(`/api/admin/candidates/${c.id}/status`, { json: { status: "APPROVED" } }, "প্রার্থী অনুমোদিত হয়েছেন")}><CheckCircle2 /> অনুমোদন দিন</Button>
            : <Button size="sm" variant="outline" loading={busy} onClick={() => run(`/api/admin/candidates/${c.id}/status`, { json: { status: "INACTIVE" } }, "প্রার্থী নিষ্ক্রিয় করা হয়েছে")}><XCircle /> নিষ্ক্রিয় করুন</Button>}
          <Button size="icon" variant="ghost" aria-label="প্রার্থী মুছুন" onClick={() => { if (confirm(`${c.displayName}-কে এই নির্বাচন থেকে সরিয়ে দেবেন?`)) void run(`/api/admin/candidates/${c.id}`, { method: "DELETE" }, "প্রার্থী সরানো হয়েছে"); }}><Trash2 /></Button>
        </>}
      </div>
    </Card>
  );
}
