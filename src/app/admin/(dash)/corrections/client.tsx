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
      <DialogTrigger asChild><Button><FilePlus2 /> New correction request</Button></DialogTrigger>
      <DialogContent title="Correction request" description="Find the ballot reference in the anonymous ballot ledger (Results → Ballot ledger). A second administrator must approve.">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData();
          Object.entries({ ...f, electionId }).forEach(([k, v]) => fd.set(k, v));
          if (file) fd.set("evidence", file);
          const r = await run("/api/admin/corrections", { form: fd }, "Correction request submitted for approval");
          if (r) { setOpen(false); setF({ ballotRef: "", correction: "INVALIDATE_BALLOT", reason: "", evidenceNote: "" }); setFile(null); }
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ballot reference" htmlFor="br"><Input id="br" placeholder="B-XXXXXXXXXXXXXXXX" value={f.ballotRef} onChange={(e) => setF({ ...f, ballotRef: e.target.value.toUpperCase() })} required className="font-mono" maxLength={18} /></Field>
            <Field label="Correction" htmlFor="ct"><Select id="ct" value={f.correction} onChange={(e) => setF({ ...f, correction: e.target.value })}><option value="INVALIDATE_BALLOT">Invalidate ballot</option><option value="REINSTATE_BALLOT">Reinstate ballot</option></Select></Field>
          </div>
          <Field label="Reason (mandatory, min. 20 characters)" htmlFor="rs"><Textarea id="rs" rows={4} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required minLength={20} maxLength={2000} /></Field>
          <Field label="Evidence description" htmlFor="en"><Textarea id="en" rows={2} value={f.evidenceNote} onChange={(e) => setF({ ...f, evidenceNote: e.target.value })} maxLength={2000} /></Field>
          <Field label="Attachment (optional)" htmlFor="ef" hint="PDF, JPEG, PNG or WebP · max 5 MB"><Input id="ef" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-2" /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>Submit for approval</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewCorrection({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { run, busy, error } = useAction();
  const submit = async (approve: boolean) => {
    const r = await run(`/api/admin/corrections/${id}/review`, { json: { approve, note } }, approve ? "Correction approved and applied" : "Correction rejected");
    if (r) setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Gavel /> Review</Button></DialogTrigger>
      <DialogContent title="Review correction" description="Approval changes the ballot's status (never its content) and is recorded immutably.">
        <div className="space-y-4">
          <Field label="Review note" htmlFor="rn"><Textarea id="rn" rows={3} value={note} onChange={(e) => setNote(e.target.value)} minLength={5} maxLength={2000} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="danger" loading={busy} disabled={note.trim().length < 5} onClick={() => submit(false)}>Reject</Button>
            <Button variant="success" loading={busy} disabled={note.trim().length < 5} onClick={() => submit(true)}>Approve</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CancelCorrection({ id }: { id: string }) {
  const { run, busy } = useAction();
  return <Button size="sm" variant="outline" loading={busy} onClick={() => { if (confirm("Withdraw this correction request?")) void run(`/api/admin/corrections/${id}/cancel`, { method: "POST" }, "Request withdrawn"); }}><Undo2 /> Withdraw</Button>;
}
