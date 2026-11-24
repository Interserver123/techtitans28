"use client";
import { useMemo, useState } from "react";
import { FilePlus2, Search, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/admin/use-action";
import { fmtDateTime } from "@/lib/format";

type Choice = {
  positionId: string; positionCode: string; gender: string | null;
  originalCandidateId: string; originalName: string; originalRef: string;
  candidateId: string; candidateName: string; ballotRef: string; status: "VALID" | "INVALIDATED";
  corrections: number; legacyChangedAt: string | null; legacyReason: string | null;
  pending: { id: string; correction: string; candidateName: string | null; requestedBy: string } | null;
};
type Voter = { studentId: string; roll: string; name: string; votedAt: string; receipt: string; anonymous: boolean; choices: Choice[] };
type Pos = { id: string; code: string; gender: string | null };
type Cand = { id: string; positionId: string; name: string };

const posName = (g: string | null) => (g === "MALE" ? "ছাত্র সিআর" : g === "FEMALE" ? "ছাত্রী সিআর" : "সিআর");

function RequestDialog({ electionId, voter, choice, candidates }: { electionId: string; voter: Voter; choice: Choice; candidates: Cand[] }) {
  const [open, setOpen] = useState(false);
  const options = candidates.filter((c) => c.positionId === choice.positionId && c.id !== choice.candidateId);
  const [candidateId, setCandidateId] = useState(options[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const { run, busy, error } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`${voter.name}-এর ${posName(choice.gender)} ভোট সংশোধনের অনুরোধ`}><FilePlus2 /> সংশোধনের অনুরোধ</Button>
      </DialogTrigger>
      <DialogContent title={`${posName(choice.gender)} ভোট সংশোধনের অনুরোধ`} description={`${voter.name} (রোল ${voter.roll}) — বর্তমান: ${choice.candidateName} · ${choice.ballotRef}`}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run("/api/admin/votes", { json: { electionId, studentId: voter.studentId, positionId: choice.positionId, candidateId, reason, evidenceNote } }, "অনুরোধ জমা হয়েছে — দ্বিতীয় একজন সুপার অ্যাডমিনের অনুমোদনের অপেক্ষায়");
          if (r) { setOpen(false); setReason(""); setEvidenceNote(""); }
        }}>
          <Alert tone="warning">
            এখনই কিছু বদলাবে না। ভিন্ন একজন সুপার অ্যাডমিন অনুমোদন দিলে মূল ব্যালট বাতিল চিহ্নিত হবে (মুছে ফেলা হবে না) এবং নতুন প্রার্থীর জন্য একটি যুক্ত ব্যালট যোগ হবে। কারণটি সংশোধন তালিকা ও অডিট লগে অন্য অ্যাডমিন ও নিরীক্ষকরা দেখতে পাবেন — কারণে ভোটারের নাম বা রোল লিখবেন না।
          </Alert>
          {options.length === 0 ? <Alert tone="error">এই পদে অন্য কোনো অনুমোদিত প্রার্থী নেই।</Alert> : (
            <Field label="নতুন প্রার্থী" htmlFor="cv-c">
              <Select id="cv-c" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
                {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="কারণ (বাধ্যতামূলক, অন্তত ২০ অক্ষর)" htmlFor="cv-r"><Textarea id="cv-r" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} minLength={20} maxLength={2000} required /></Field>
          <Field label="প্রমাণের বিবরণ (ঐচ্ছিক)" htmlFor="cv-e"><Textarea id="cv-e" rows={2} value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} maxLength={2000} /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={!candidateId || reason.trim().length < 20}>অনুমোদনের জন্য জমা দিন</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VoterRequestDialog({ electionId, voter, choice, candidates }: { electionId: string; voter: Voter; choice: Choice; candidates: Cand[] }) {
  const [open, setOpen] = useState(false);
  const options = candidates.filter((c) => c.positionId === choice.positionId && c.id !== choice.candidateId);
  const [candidateId, setCandidateId] = useState(options[0]?.id ?? "");
  const [channel, setChannel] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const { run, busy, error } = useAction();
  const target = options.find((c) => c.id === candidateId)?.name ?? "";
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmed(false); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`${voter.name}-এর অনুরোধে ${posName(choice.gender)} ভোট পরিবর্তন`}><UserPen /> ভোটারের অনুরোধে পরিবর্তন</Button>
      </DialogTrigger>
      <DialogContent title={`ভোটারের অনুরোধে ${posName(choice.gender)} ভোট পরিবর্তন`} description={`${voter.name} (রোল ${voter.roll}) — বর্তমান: ${choice.candidateName} · ${choice.ballotRef}`}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run("/api/admin/votes/voter-request", { json: { electionId, studentId: voter.studentId, positionId: choice.positionId, candidateId, channel, reason } }, "ভোট পরিবর্তন করা হয়েছে");
          if (r) { setOpen(false); setChannel(""); setReason(""); setConfirmed(false); }
        }}>
          <Alert tone="warning">
            শুধু তখনই ব্যবহার করুন যখন ভোটার <strong>নিজে</strong> পরিবর্তন চেয়েছেন এবং আপনি নিশ্চিত হয়েছেন অনুরোধটি তাঁরই। পরিবর্তন সঙ্গে সঙ্গে কার্যকর হবে: মূল ব্যালট বাতিল চিহ্নিত হবে (মুছে ফেলা হবে না), নতুন প্রার্থীর জন্য একটি যুক্ত ব্যালট যোগ হবে, অডিট লগে আপনার নামে লেখা হবে এবং ভোটার রসিদ পাতায় দেখতে পাবেন। কারণে ভোটারের নাম বা রোল লিখবেন না।
          </Alert>
          {options.length === 0 ? <Alert tone="error">এই পদে অন্য কোনো অনুমোদিত প্রার্থী নেই।</Alert> : (
            <Field label="নতুন প্রার্থী" htmlFor="vr-c">
              <Select id="vr-c" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
                {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="ভোটার কীভাবে অনুরোধ করেছেন (বাধ্যতামূলক)" htmlFor="vr-ch"><Input id="vr-ch" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="যেমন: ফেসবুক মেসেজ, ২৪ নভেম্বর সকাল ১০টা" minLength={2} maxLength={200} required /></Field>
          <Field label="কারণ (বাধ্যতামূলক, অন্তত ২০ অক্ষর)" htmlFor="vr-r"><Textarea id="vr-r" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} minLength={20} maxLength={2000} required /></Field>
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>আমি নিশ্চিত করছি যে ভোটার নিজে {choice.candidateName} থেকে {target || "নতুন প্রার্থী"}-তে ভোট পরিবর্তনের অনুরোধ করেছেন।</span>
          </label>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={!candidateId || !confirmed || channel.trim().length < 2 || reason.trim().length < 20}>এখনই পরিবর্তন করুন</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VotesTable({ electionId, voters, positions, candidates, canRequest, canVoterChange, adminId }: { electionId: string; voters: Voter[]; positions: Pos[]; candidates: Cand[]; canRequest: boolean; canVoterChange: boolean; adminId: string }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? voters.filter((v) => v.name.toLowerCase().includes(s) || v.roll.toLowerCase().includes(s)) : voters;
  }, [q, voters]);
  const cell = (v: Voter, p: Pos) => {
    if (v.anonymous) return <span className="text-xs text-slate-500">বেনামি (নোটিশের আগে)</span>;
    const c = v.choices.find((x) => x.positionId === p.id);
    if (!c) return <span className="text-slate-500">—</span>;
    const changed = c.originalCandidateId !== c.candidateId || c.originalRef !== c.ballotRef;
    return (
      <div className="space-y-1">
        <p className={c.status === "INVALIDATED" ? "text-slate-500 line-through" : "text-slate-100"}>{c.candidateName}</p>
        <p className="font-mono text-[11px] text-slate-500">{c.ballotRef}</p>
        {c.status === "INVALIDATED" && <Badge tone="red">বাতিল</Badge>}
        {changed && <p className="text-[11px] text-amber-300">সংশোধিত · মূল ভোট: {c.originalName} ({c.originalRef})</p>}
        {c.legacyChangedAt && <p className="text-[11px] text-amber-300">পুরোনো সরাসরি পরিবর্তন {fmtDateTime(c.legacyChangedAt)}{c.legacyReason ? ` · ${c.legacyReason}` : ""}</p>}
        {c.corrections > 0 && <p className="text-[11px] text-slate-400">অনুমোদিত সংশোধন: {c.corrections}</p>}
        {c.pending ? (
          <p className="text-[11px] text-gold-300">
            অপেক্ষমাণ অনুরোধ{c.pending.candidateName ? ` → ${c.pending.candidateName}` : ""}{c.pending.requestedBy === adminId ? " (আপনার — অন্য সুপার অ্যাডমিনের অনুমোদন লাগবে)" : ""}
          </p>
        ) : c.status === "VALID" && (canVoterChange || canRequest) && (
          <div className="flex flex-wrap gap-2">
            {canVoterChange && <VoterRequestDialog electionId={electionId} voter={v} choice={c} candidates={candidates} />}
            {canRequest && <RequestDialog electionId={electionId} voter={v} choice={c} candidates={candidates} />}
          </div>
        )}
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
