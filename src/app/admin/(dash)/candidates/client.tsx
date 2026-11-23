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
      <DialogTrigger asChild>{candidate ? <Button size="sm" variant="outline"><Pencil /> Edit</Button> : <Button><PlusCircle /> Add candidate</Button>}</DialogTrigger>
      <DialogContent wide title={candidate ? "Edit candidate" : "Add candidate"} description="New candidates start as pending until approved.">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = candidate
            ? await run(`/api/admin/candidates/${candidate.id}`, { method: "PATCH", json: f }, "Candidate updated")
            : await run("/api/admin/candidates", { json: { ...f, electionId } }, "Candidate added");
          if (r) setOpen(false);
        }}>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_110px]">
            <Field label="Student roll number" htmlFor="cr"><Input id="cr" value={f.rollNumber} onChange={(e) => setF({ ...f, rollNumber: e.target.value.toUpperCase() })} required maxLength={20} /></Field>
            <Field label="Display name" htmlFor="cn"><Input id="cn" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required maxLength={120} /></Field>
            <Field label="Order" htmlFor="co"><Input id="co" type="number" min={0} max={999} value={f.displayOrder} onChange={(e) => setF({ ...f, displayOrder: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Short introduction" htmlFor="ci" hint={`${f.introduction.length}/600`}><Textarea id="ci" rows={3} value={f.introduction} onChange={(e) => setF({ ...f, introduction: e.target.value })} maxLength={600} /></Field>
          <Field label="Manifesto" htmlFor="cm" hint={`${f.manifesto.length}/6000`}><Textarea id="cm" rows={8} value={f.manifesto} onChange={(e) => setF({ ...f, manifesto: e.target.value })} maxLength={6000} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>{candidate ? "Save" : "Add candidate"}</Button>
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
        await run(`/api/admin/candidates/${id}/photo`, { form: fd }, "Photo updated");
        e.target.value = "";
      }} />
      <Button size="sm" variant="outline" loading={busy} onClick={() => ref.current?.click()}><Camera /> Photo</Button>
    </>
  );
}

function Preview({ c }: { c: C }) {
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="ghost"><Eye /> Preview</Button></DialogTrigger>
      <DialogContent title="Public profile preview" className="!bg-white !text-ink">
        <div className="overflow-hidden rounded-2xl border border-line">
          <CandidateAvatar name={c.displayName} url={c.photoUrl} className="aspect-[4/3] w-full" />
          <div className="p-5">
            <p className="text-lg font-semibold">{c.displayName}</p>
            <p className="text-sm text-muted">Roll {c.rollNumber}</p>
            <p className="mt-3 text-sm text-slate-600">{c.introduction || "No introduction."}</p>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700">{c.manifesto || "No manifesto."}</p>
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
        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{c.displayName}</p><Badge tone={tone}>{c.status.toLowerCase()}</Badge></div>
        <p className="text-sm text-slate-400">Roll {c.rollNumber} · Register name: {c.studentName} · Order {c.displayOrder}</p>
        <p className="mt-1 line-clamp-1 text-sm text-slate-500">{c.introduction || "No introduction yet."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Preview c={c} />
        {editable && <>
          <PhotoUpload id={c.id} />
          <CandidateDialog electionId={c.electionId} candidate={c} />
          {c.status !== "APPROVED"
            ? <Button size="sm" variant="success" loading={busy} onClick={() => run(`/api/admin/candidates/${c.id}/status`, { json: { status: "APPROVED" } }, "Candidate approved")}><CheckCircle2 /> Approve</Button>
            : <Button size="sm" variant="outline" loading={busy} onClick={() => run(`/api/admin/candidates/${c.id}/status`, { json: { status: "INACTIVE" } }, "Candidate deactivated")}><XCircle /> Deactivate</Button>}
          <Button size="icon" variant="ghost" aria-label="Delete candidate" onClick={() => { if (confirm(`Remove ${c.displayName} from this election?`)) void run(`/api/admin/candidates/${c.id}`, { method: "DELETE" }, "Candidate removed"); }}><Trash2 /></Button>
        </>}
      </div>
    </Card>
  );
}
