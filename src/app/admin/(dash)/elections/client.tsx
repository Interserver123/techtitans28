"use client";
import { useState } from "react";
import { CalendarPlus, Pause, Pencil, Play, Square, Trash2, CalendarCheck2, Undo2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ElectionStatusBadge } from "@/components/admin/ui";
import { useAction } from "@/components/admin/use-action";
import { bnNum, fmtDateTime, fromDhakaLocalInput, toDhakaLocalInput } from "@/lib/format";

type E = { id: string; title: string; description: string; status: string; opensAt: string; closesAt: string; openedAt: string | null; closedAt: string | null; publishedAt: string | null; approved: number; votes: number };

export function ElectionForm({ election }: { election?: E }) {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const now = new Date();
  const [f, setF] = useState({
    title: election?.title ?? "টেকটাইটানস-২৮ সিআর নির্বাচন ২০২৬",
    description: election?.description ?? "",
    opensAt: toDhakaLocalInput(election?.opensAt ?? new Date(now.getTime() + 86400e3)),
    closesAt: toDhakaLocalInput(election?.closesAt ?? new Date(now.getTime() + 86400e3 + 8 * 3600e3)),
  });
  const live = election && ["LIVE", "PAUSED"].includes(election.status);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {election ? <Button size="sm" variant="outline"><Pencil /> সম্পাদনা</Button> : <Button><CalendarPlus /> নতুন নির্বাচন</Button>}
      </DialogTrigger>
      <DialogContent title={election ? "নির্বাচন সম্পাদনা" : "নির্বাচন তৈরি"} description="সময় বাংলাদেশ সময় অনুযায়ী (UTC+6)।">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const body = { title: f.title, description: f.description, opensAt: fromDhakaLocalInput(f.opensAt).toISOString(), closesAt: fromDhakaLocalInput(f.closesAt).toISOString() };
          const r = election
            ? await run(`/api/admin/elections/${election.id}`, { method: "PATCH", json: body }, "নির্বাচন হালনাগাদ হয়েছে")
            : await run("/api/admin/elections", { json: body }, "নির্বাচন তৈরি হয়েছে");
          if (r) setOpen(false);
        }}>
          {live && <Alert tone="info">ভোটগ্রহণ চলছে: শুধু শেষ হওয়ার সময় বাড়ানো যাবে।</Alert>}
          <Field label="শিরোনাম" htmlFor="t"><Input id="t" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={160} disabled={!!live} /></Field>
          <Field label="বিবরণ" htmlFor="d" hint="পাবলিক ওয়েবসাইটে দেখানো হবে।"><Textarea id="d" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={4000} disabled={!!live} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="শুরু" htmlFor="o"><Input id="o" type="datetime-local" value={f.opensAt} onChange={(e) => setF({ ...f, opensAt: e.target.value })} required disabled={!!live} /></Field>
            <Field label="শেষ" htmlFor="c"><Input id="c" type="datetime-local" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} required /></Field>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>{election ? "পরিবর্তন সংরক্ষণ করুন" : "নির্বাচন তৈরি করুন"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ACTIONS: Record<string, { action: string; label: string; icon: React.ComponentType; variant: "default" | "outline" | "danger" | "success"; reason?: boolean; confirm: string }[]> = {
  DRAFT: [{ action: "schedule", label: "সময়সূচি নির্ধারণ", icon: CalendarCheck2, variant: "default", confirm: "এই নির্বাচনের সময়সূচি নির্ধারণ করবেন? নির্ধারিত সময়ে এটি স্বয়ংক্রিয়ভাবে শুরু হবে।" }],
  SCHEDULED: [
    { action: "open", label: "এখনই শুরু করুন", icon: Play, variant: "success", confirm: "এখনই ভোটগ্রহণ শুরু করবেন? ভোট শুরু হলে প্রার্থী তালিকা আর বদলানো যাবে না।" },
    { action: "unschedule", label: "খসড়ায় ফেরত", icon: Undo2, variant: "outline", confirm: "এই নির্বাচনটি খসড়ায় ফিরিয়ে নেবেন?" },
    { action: "close", label: "বাতিল/বন্ধ", icon: Square, variant: "danger", reason: true, confirm: "শুরু হওয়ার আগেই এই নির্বাচন বন্ধ করবেন?" },
  ],
  LIVE: [
    { action: "pause", label: "স্থগিত করুন", icon: Pause, variant: "outline", reason: true, confirm: "ভোটগ্রহণ স্থগিত করবেন? আবার চালু না করা পর্যন্ত কোনো ব্যালট গ্রহণ করা হবে না।" },
    { action: "close", label: "ভোটগ্রহণ শেষ করুন", icon: Square, variant: "danger", reason: true, confirm: "এখনই ভোটগ্রহণ শেষ করবেন? এটি আর ফেরানো যাবে না।" },
  ],
  PAUSED: [
    { action: "resume", label: "আবার চালু করুন", icon: Play, variant: "success", confirm: "ভোটগ্রহণ আবার চালু করবেন?" },
    { action: "close", label: "ভোটগ্রহণ শেষ করুন", icon: Square, variant: "danger", reason: true, confirm: "এখনই ভোটগ্রহণ শেষ করবেন? এটি আর ফেরানো যাবে না।" },
  ],
};

function TransitionButton({ id, a }: { id: string; a: (typeof ACTIONS)["LIVE"][number] }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, busy, error } = useAction();
  const Icon = a.icon;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant={a.variant}><Icon /> {a.label}</Button></DialogTrigger>
      <DialogContent title={a.label} description={a.confirm}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(`/api/admin/elections/${id}/transition`, { json: { action: a.action, reason: reason || undefined } }, `নির্বাচন: ${a.label} সম্পন্ন`);
          if (r) setOpen(false);
        }}>
          {a.reason && <Field label="কারণ (অডিট লগে লিপিবদ্ধ হবে)" htmlFor="reason"><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} maxLength={500} /></Field>}
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant={a.variant === "outline" ? "default" : a.variant} className="w-full" loading={busy}>নিশ্চিত করুন: {a.label}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ElectionCard({ election: e, canConfigure, canControl }: { election: E; canConfigure: boolean; canControl: boolean }) {
  const { run, busy } = useAction();
  const actions = ACTIONS[e.status] ?? [];
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{e.title}</h2>
            <ElectionStatusBadge status={e.status} />
          </div>
          {e.description && <p className="mt-1 line-clamp-2 text-sm text-slate-400">{e.description}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-slate-500">শুরু</dt><dd className="text-slate-200">{fmtDateTime(e.opensAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">শেষ</dt><dd className="text-slate-200">{fmtDateTime(e.closesAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">অনুমোদিত প্রার্থী</dt><dd className="text-slate-200">{bnNum(e.approved)}</dd></div>
            <div><dt className="text-xs text-slate-500">ব্যালট</dt><dd className="text-slate-200">{bnNum(e.votes)}</dd></div>
            {e.openedAt && <div><dt className="text-xs text-slate-500">শুরু হয়েছে</dt><dd className="text-slate-200">{fmtDateTime(e.openedAt)}</dd></div>}
            {e.closedAt && <div><dt className="text-xs text-slate-500">শেষ হয়েছে</dt><dd className="text-slate-200">{fmtDateTime(e.closedAt)}</dd></div>}
            {e.publishedAt && <div><dt className="text-xs text-slate-500">ফলাফল প্রকাশ</dt><dd className="text-slate-200">{fmtDateTime(e.publishedAt)}</dd></div>}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {canConfigure && ["DRAFT", "SCHEDULED", "LIVE", "PAUSED"].includes(e.status) && <ElectionForm election={e} />}
          {canControl && actions.map((a) => <TransitionButton key={a.action} id={e.id} a={a} />)}
          {canConfigure && e.status === "DRAFT" && (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => { if (confirm("এই খসড়া নির্বাচন ও এর প্রার্থীদের মুছে ফেলবেন?")) void run(`/api/admin/elections/${e.id}`, { method: "DELETE" }, "খসড়া মুছে ফেলা হয়েছে"); }}><Trash2 /> মুছুন</Button>
          )}
          {e.status === "LIVE" && <span className="inline-flex items-center gap-1.5 text-xs text-green-400"><Radio className="size-3.5" /> ব্যালট গ্রহণ চলছে</span>}
        </div>
      </div>
    </Card>
  );
}
