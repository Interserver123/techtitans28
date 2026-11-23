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
      onClick={() => { if (confirm("বর্তমান মিলিয়ে দেখা গণনার যাচাই লিপিবদ্ধ করবেন?")) void run(`/api/admin/results/${electionId}/verify`, { method: "POST" }, "ফলাফল যাচাই সম্পন্ন"); }}>
      <BadgeCheck /> {verified ? "আবার যাচাই করুন" : "ফলাফল যাচাই করুন"}
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
      <DialogTrigger asChild><Button className="w-full" variant="success" disabled={!ready}><Megaphone /> অফিসিয়াল ফলাফল প্রকাশ করুন</Button></DialogTrigger>
      <DialogContent title="অফিসিয়াল ফলাফল প্রকাশ" description="প্রকাশ স্থায়ী, ফেরানো যায় না। পাবলিক ওয়েবসাইটে প্রার্থীভিত্তিক ফলাফল ও অফিসিয়াল প্রতিবেদন দেখানো হবে।">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(`/api/admin/results/${electionId}/publish`, { json: { note, confirm: confirmText } }, "ফলাফল প্রকাশিত হয়েছে");
          if (r) setOpen(false);
        }}>
          {tie && <Alert tone="warning" title="সমান ভোট">সমতা নিষ্পত্তিতে নির্বাচন কমিটির সিদ্ধান্ত লিপিবদ্ধ করুন। স্বয়ংক্রিয়ভাবে কাউকে বিজয়ী ঘোষণা করা হয় না।</Alert>}
          <Field label={tie ? "সমতা নিষ্পত্তির নোট (আবশ্যক)" : "প্রকাশের নোট (ঐচ্ছিক)"} htmlFor="pn"><Textarea id="pn" value={note} onChange={(e) => setNote(e.target.value)} required={tie} minLength={tie ? 10 : 0} maxLength={2000} /></Field>
          <Field label='নিশ্চিত করতে "PUBLISH" লিখুন' htmlFor="pc"><Input id="pc" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="success" className="w-full" loading={busy} disabled={confirmText !== "PUBLISH"}>এখনই প্রকাশ করুন</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
