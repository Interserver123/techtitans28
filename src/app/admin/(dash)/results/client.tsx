"use client";
import { useState } from "react";
import { BadgeCheck, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useAction } from "@/components/admin/use-action";

export function VerifyButton({ electionId, verified }: { electionId: string; verified: boolean }) {
  const { run, busy } = useAction();
  return (
    <Button className="w-full" variant={verified ? "outline" : "default"} loading={busy}
      onClick={() => { if (confirm("Record verification of the current reconciled tally?")) void run(`/api/admin/results/${electionId}/verify`, { method: "POST" }, "Results verified"); }}>
      <BadgeCheck /> {verified ? "Re-verify tally" : "Verify results"}
    </Button>
  );
}

export function PublishDialog({ electionId, tie, ready }: { electionId: string; tie: boolean; ready: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const { run, busy, error } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="w-full" variant="success" disabled={!ready}><Megaphone /> Publish official results</Button></DialogTrigger>
      <DialogContent title="Publish official results" description="Publication is permanent. The public website will show candidate-wise results and the official report.">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(`/api/admin/results/${electionId}/publish`, { json: { note, confirm: confirmText } }, "Results published");
          if (r) setOpen(false);
        }}>
          {tie && <Alert tone="warning" title="Tied result">Record the Election Committee&apos;s tie-resolution decision. No winner is declared automatically.</Alert>}
          <Field label={tie ? "Tie-resolution note (required)" : "Publication note (optional)"} htmlFor="pn"><Textarea id="pn" value={note} onChange={(e) => setNote(e.target.value)} required={tie} minLength={tie ? 10 : 0} maxLength={2000} /></Field>
          <Field label='Type "PUBLISH" to confirm' htmlFor="pc"><Input id="pc" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="success" className="w-full" loading={busy} disabled={confirmText !== "PUBLISH"}>Publish now</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
