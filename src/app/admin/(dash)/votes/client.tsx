"use client";
import { useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/admin/use-action";
import { fmtDateTime } from "@/lib/format";

type Choice = { positionId: string; positionCode: string; gender: string | null; candidateId: string; candidateName: string; changedAt: string | null; reason: string | null; originalName: string | null };
type Voter = { studentId: string; roll: string; name: string; votedAt: string; receipt: string; anonymous: boolean; choices: Choice[] };
type Pos = { id: string; code: string; gender: string | null };
type Cand = { id: string; positionId: string; name: string };

const posName = (g: string | null) => (g === "MALE" ? "ছাত্র সিআর" : g === "FEMALE" ? "ছাত্রী সিআর" : "সিআর");

function ChangeDialog({ electionId, voter, choice, candidates }: { electionId: string; voter: Voter; choice: Choice; candidates: Cand[] }) {
  const [open, setOpen] = useState(false);
  const [candidateId, setCandidateId] = useState(choice.candidateId);
  const [reason, setReason] = useState("");
  const { run, busy, error } = useAction();
  const options = candidates.filter((c) => c.positionId === choice.positionId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon" variant="ghost" aria-label={`${voter.name}-এর ${posName(choice.gender)} ভোট পরিবর্তন`}><Pencil /></Button></DialogTrigger>
      <DialogContent title={`${posName(choice.gender)} ভোট পরিবর্তন`} description={`${voter.name} (রোল ${voter.roll}) — বর্তমান: ${choice.candidateName}`}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run("/api/admin/votes", { method: "PATCH", json: { electionId, studentId: voter.studentId, positionId: choice.positionId, candidateId, reason } }, "ভোট পরিবর্তন হয়েছে");
          if (r) { setOpen(false); window.location.reload(); }
        }}>
          <Alert tone="warning">পরিবর্তনটি অডিট লগে কারণসহ লেখা হবে এবং ভোটার তার রসিদ পাতায় তা জানতে পারবেন।</Alert>
          <Field label="নতুন প্রার্থী" htmlFor="cv-c">
            <Select id="cv-c" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="পরিবর্তনের কারণ (বাধ্যতামূলক)" htmlFor="cv-r"><Input id="cv-r" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} required /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={candidateId === choice.candidateId || reason.trim().length < 5}>পরিবর্তন সংরক্ষণ করুন</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VotesTable({ electionId, voters, positions, candidates, canChange }: { electionId: string; voters: Voter[]; positions: Pos[]; candidates: Cand[]; canChange: boolean }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? voters.filter((v) => v.name.toLowerCase().includes(s) || v.roll.toLowerCase().includes(s)) : voters;
  }, [q, voters]);
  const cell = (v: Voter, p: Pos) => {
    if (v.anonymous) return <span className="text-xs text-slate-500">বেনামি (নোটিশের আগে)</span>;
    const c = v.choices.find((x) => x.positionId === p.id);
    if (!c) return <span className="text-slate-500">—</span>;
    return (
      <div className="flex items-center gap-1">
        <div>
          <p className="text-slate-100">{c.candidateName}</p>
          {c.changedAt && <p className="text-[11px] text-amber-300">পরিবর্তিত {fmtDateTime(c.changedAt)}{c.originalName ? ` · আগে: ${c.originalName}` : ""}{c.reason ? ` · ${c.reason}` : ""}</p>}
        </div>
        {canChange && <ChangeDialog electionId={electionId} voter={v} choice={c} candidates={candidates} />}
      </div>
    );
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-300">মোট ভোটদাতা: <strong className="text-white">{voters.length}</strong></p>
        <label className="relative block sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="নাম বা রোল দিয়ে খুঁজুন…" aria-label="খুঁজুন" className="h-10 pl-9" />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr><th className="px-4 py-2">রোল</th><th className="px-4 py-2">নাম</th><th className="px-4 py-2">সময়</th>{positions.map((p) => <th key={p.id} className="px-4 py-2">{posName(p.gender)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {shown.length === 0 && <tr><td colSpan={3 + positions.length} className="px-4 py-10 text-center text-slate-500">এখনো কোনো ভোট নেই।</td></tr>}
            {shown.map((v) => (
              <tr key={v.studentId} className="align-top">
                <td className="px-4 py-3 font-mono text-xs text-slate-200">{v.roll}</td>
                <td className="px-4 py-3 text-slate-100">{v.name}{v.anonymous && <Badge tone="amber" className="ml-2">বেনামি</Badge>}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{fmtDateTime(v.votedAt)}</td>
                {positions.map((p) => <td key={p.id} className="px-4 py-3">{cell(v, p)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
