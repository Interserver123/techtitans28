"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useAction } from "@/components/admin/use-action";

export function DisputeAction({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ status: "UNDER_REVIEW", resolutionNote: "" });
  const { run, busy, error } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Update</Button></DialogTrigger>
      <DialogContent title="Update dispute">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(`/api/admin/disputes/${id}`, { method: "PATCH", json: f }, "Dispute updated")) setOpen(false); }}>
          <Field label="Status" htmlFor="ds"><Select id="ds" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="UNDER_REVIEW">Under review</option><option value="RESOLVED">Resolved</option><option value="REJECTED">Rejected</option></Select></Field>
          <Field label="Note / decision" htmlFor="dn"><Textarea id="dn" value={f.resolutionNote} onChange={(e) => setF({ ...f, resolutionNote: e.target.value })} required minLength={5} maxLength={3000} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
