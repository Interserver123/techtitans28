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
import { fmtDateTime, fromDhakaLocalInput, toDhakaLocalInput } from "@/lib/format";

type E = { id: string; title: string; description: string; status: string; opensAt: string; closesAt: string; openedAt: string | null; closedAt: string | null; publishedAt: string | null; approved: number; votes: number };

export function ElectionForm({ election }: { election?: E }) {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const now = new Date();
  const [f, setF] = useState({
    title: election?.title ?? "TechTitans-28 CR Election 2026",
    description: election?.description ?? "",
    opensAt: toDhakaLocalInput(election?.opensAt ?? new Date(now.getTime() + 86400e3)),
    closesAt: toDhakaLocalInput(election?.closesAt ?? new Date(now.getTime() + 86400e3 + 8 * 3600e3)),
  });
  const live = election && ["LIVE", "PAUSED"].includes(election.status);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {election ? <Button size="sm" variant="outline"><Pencil /> Edit</Button> : <Button><CalendarPlus /> New election</Button>}
      </DialogTrigger>
      <DialogContent title={election ? "Edit election" : "Create election"} description="Times are in Asia/Dhaka (UTC+6).">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const body = { title: f.title, description: f.description, opensAt: fromDhakaLocalInput(f.opensAt).toISOString(), closesAt: fromDhakaLocalInput(f.closesAt).toISOString() };
          const r = election
            ? await run(`/api/admin/elections/${election.id}`, { method: "PATCH", json: body }, "Election updated")
            : await run("/api/admin/elections", { json: body }, "Election created");
          if (r) setOpen(false);
        }}>
          {live && <Alert tone="info">Voting is underway: only extending the closing time is permitted.</Alert>}
          <Field label="Title" htmlFor="t"><Input id="t" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={160} disabled={!!live} /></Field>
          <Field label="Description" htmlFor="d" hint="Shown on the public website."><Textarea id="d" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={4000} disabled={!!live} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opens" htmlFor="o"><Input id="o" type="datetime-local" value={f.opensAt} onChange={(e) => setF({ ...f, opensAt: e.target.value })} required disabled={!!live} /></Field>
            <Field label="Closes" htmlFor="c"><Input id="c" type="datetime-local" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} required /></Field>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>{election ? "Save changes" : "Create election"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ACTIONS: Record<string, { action: string; label: string; icon: React.ComponentType; variant: "default" | "outline" | "danger" | "success"; reason?: boolean; confirm: string }[]> = {
  DRAFT: [{ action: "schedule", label: "Schedule", icon: CalendarCheck2, variant: "default", confirm: "Schedule this election? It will open automatically at the opening time." }],
  SCHEDULED: [
    { action: "open", label: "Open now", icon: Play, variant: "success", confirm: "Open voting immediately? The candidate list locks once voting starts." },
    { action: "unschedule", label: "Back to draft", icon: Undo2, variant: "outline", confirm: "Return this election to draft?" },
    { action: "close", label: "Cancel/close", icon: Square, variant: "danger", reason: true, confirm: "Close this election before it opens?" },
  ],
  LIVE: [
    { action: "pause", label: "Pause", icon: Pause, variant: "outline", reason: true, confirm: "Pause voting? No ballots will be accepted until resumed." },
    { action: "close", label: "Close voting", icon: Square, variant: "danger", reason: true, confirm: "Close voting now? This cannot be undone." },
  ],
  PAUSED: [
    { action: "resume", label: "Resume", icon: Play, variant: "success", confirm: "Resume voting?" },
    { action: "close", label: "Close voting", icon: Square, variant: "danger", reason: true, confirm: "Close voting now? This cannot be undone." },
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
          const r = await run(`/api/admin/elections/${id}/transition`, { json: { action: a.action, reason: reason || undefined } }, `Election: ${a.label.toLowerCase()} done`);
          if (r) setOpen(false);
        }}>
          {a.reason && <Field label="Reason (recorded in the audit log)" htmlFor="reason"><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} maxLength={500} /></Field>}
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant={a.variant === "outline" ? "default" : a.variant} className="w-full" loading={busy}>Confirm: {a.label}</Button>
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
            <div><dt className="text-xs text-slate-500">Opens</dt><dd className="text-slate-200">{fmtDateTime(e.opensAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Closes</dt><dd className="text-slate-200">{fmtDateTime(e.closesAt)}</dd></div>
            <div><dt className="text-xs text-slate-500">Approved candidates</dt><dd className="text-slate-200">{e.approved}</dd></div>
            <div><dt className="text-xs text-slate-500">Ballots</dt><dd className="text-slate-200">{e.votes}</dd></div>
            {e.openedAt && <div><dt className="text-xs text-slate-500">Opened</dt><dd className="text-slate-200">{fmtDateTime(e.openedAt)}</dd></div>}
            {e.closedAt && <div><dt className="text-xs text-slate-500">Closed</dt><dd className="text-slate-200">{fmtDateTime(e.closedAt)}</dd></div>}
            {e.publishedAt && <div><dt className="text-xs text-slate-500">Results published</dt><dd className="text-slate-200">{fmtDateTime(e.publishedAt)}</dd></div>}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {canConfigure && ["DRAFT", "SCHEDULED", "LIVE", "PAUSED"].includes(e.status) && <ElectionForm election={e} />}
          {canControl && actions.map((a) => <TransitionButton key={a.action} id={e.id} a={a} />)}
          {canConfigure && e.status === "DRAFT" && (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => { if (confirm("Delete this draft election and its candidates?")) void run(`/api/admin/elections/${e.id}`, { method: "DELETE" }, "Draft deleted"); }}><Trash2 /> Delete</Button>
          )}
          {e.status === "LIVE" && <span className="inline-flex items-center gap-1.5 text-xs text-green-400"><Radio className="size-3.5" /> Accepting ballots</span>}
        </div>
      </div>
    </Card>
  );
}
