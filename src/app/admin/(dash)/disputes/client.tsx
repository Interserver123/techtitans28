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
      <DialogTrigger asChild><Button size="sm" variant="outline">হালনাগাদ</Button></DialogTrigger>
      <DialogContent title="অভিযোগ হালনাগাদ">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await run(`/api/admin/disputes/${id}`, { method: "PATCH", json: f }, "অভিযোগ হালনাগাদ হয়েছে")) setOpen(false); }}>
          <Field label="অবস্থা" htmlFor="ds"><Select id="ds" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="UNDER_REVIEW">পর্যালোচনাধীন</option><option value="RESOLVED">নিষ্পন্ন</option><option value="REJECTED">প্রত্যাখ্যাত</option></Select></Field>
          <Field label="নোট / সিদ্ধান্ত" htmlFor="dn"><Textarea id="dn" value={f.resolutionNote} onChange={(e) => setF({ ...f, resolutionNote: e.target.value })} required minLength={5} maxLength={3000} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>সংরক্ষণ করুন</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
