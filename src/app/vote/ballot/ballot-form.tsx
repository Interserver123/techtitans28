"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Clock, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CandidateAvatar } from "@/components/site/candidate-avatar";
import { cn } from "@/lib/utils";

type C = { id: string; display_name: string; roll_number: string; introduction: string; manifesto: string; photo_url: string | null };

export function BallotForm({ candidates, expiresAt, serverNow }: { candidates: C[]; expiresAt: string; serverNow: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [stage, setStage] = useState<"choose" | "review">("choose");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - new Date(serverNow).getTime());
  useEffect(() => {
    const skew = new Date(serverNow).getTime() - Date.now();
    const t = setInterval(() => setLeft(new Date(expiresAt).getTime() - (Date.now() + skew)), 1000);
    return () => clearInterval(t);
  }, [expiresAt, serverNow]);
  const choice = candidates.find((c) => c.id === selected) ?? null;
  const expired = left <= 0;

  async function submit() {
    if (!choice || !confirmed) return;
    setBusy(true); setError(null);
    const r = await api("/api/vote/cast", { json: { candidateId: choice.id } });
    if (r.ok || (!r.ok && r.error.code === "ALREADY_VOTED")) {
      router.replace("/vote/receipt");
      router.refresh();
      return;
    }
    if (r.error.code === "NETWORK") {
      // The ballot may have been recorded before the connection dropped: ask the server.
      const s = await api<{ hasVoted: boolean }>("/api/vote/status");
      if (s.ok && s.hasVoted) {
        router.replace("/vote/receipt");
        router.refresh();
        return;
      }
    }
    setBusy(false);
    if (r.error.code === "SESSION_INVALID") {
      router.replace("/vote");
      router.refresh();
      return;
    }
    setError(r.error.message);
  }

  const mm = Math.max(0, Math.floor(left / 60000));
  const ss = Math.max(0, Math.floor((left % 60000) / 1000));

  return (
    <div className="mt-6 pb-28">
      <div className={cn("mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1", left < 120000 ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-100 text-slate-600 ring-slate-200")}>
        <Clock className="size-3.5" /> Session {expired ? "expired" : `expires in ${mm}:${String(ss).padStart(2, "0")}`}
      </div>
      {expired && <Alert tone="warning" title="Session expired" className="mb-4">For security, please <a className="underline" href="/vote">verify again</a>. No ballot was submitted.</Alert>}

      {stage === "choose" ? (
        <fieldset>
          <legend className="sr-only">Class Representative candidates</legend>
          <div className="grid gap-3">
            {candidates.map((c) => {
              const active = selected === c.id;
              return (
                <Card key={c.id} className={cn("overflow-hidden rounded-2xl transition duration-300", active ? "border-electric bg-gradient-to-br from-electric-50/70 to-white shadow-glow ring-4 ring-electric/10" : "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift")}>
                  <label className="flex cursor-pointer items-center gap-4 p-4">
                    <input type="radio" name="candidate" value={c.id} checked={active} onChange={() => setSelected(c.id)} className="peer sr-only" />
                    <CandidateAvatar name={c.display_name} url={c.photo_url} className="size-16 shrink-0 rounded-xl text-lg sm:size-20" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold sm:text-lg">{c.display_name}</p>
                      <p className="text-sm text-muted">Roll {c.roll_number}</p>
                      {c.introduction && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.introduction}</p>}
                    </div>
                    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition peer-focus-visible:ring-4 peer-focus-visible:ring-electric/30", active ? "border-electric bg-electric text-white" : "border-slate-300")}>
                      {active && <Check className="size-4" strokeWidth={3} />}
                    </span>
                  </label>
                  {c.manifesto && (
                    <div className="border-t border-line px-4">
                      <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full items-center justify-between py-2.5 text-sm font-medium text-electric" aria-expanded={open === c.id}>
                        Manifesto <ChevronDown className={cn("size-4 transition", open === c.id && "rotate-180")} />
                      </button>
                      {open === c.id && <p className="whitespace-pre-line pb-4 text-sm leading-relaxed text-slate-700">{c.manifesto}</p>}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </fieldset>
      ) : (
        choice && (
          <Card className="animate-fade-up p-6 text-center sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Review your ballot</p>
            <CandidateAvatar name={choice.display_name} url={choice.photo_url} className="mx-auto mt-5 size-28 rounded-2xl text-3xl" />
            <p className="mt-4 text-2xl font-bold tracking-tight">{choice.display_name}</p>
            <p className="text-sm text-muted">Roll {choice.roll_number} · Class Representative</p>
            <label className="mx-auto mt-6 flex max-w-md cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas p-4 text-left text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-5 accent-[#3B82F6]" />
              <span>I confirm this is my choice. I understand my ballot is <strong>final</strong> and cannot be changed after submission.</span>
            </label>
            {error && <Alert tone="error" className="mt-4 text-left">{error}</Alert>}
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted"><ShieldCheck className="size-4 text-success" /> Your identity is recorded separately from your choice.</div>
          </Card>
        )
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {stage === "choose" ? (
            <>
              <p className="min-w-0 flex-1 truncate text-sm text-muted">{choice ? <>Selected: <strong className="text-ink">{choice.display_name}</strong></> : "Select one candidate"}</p>
              <Button size="lg" disabled={!choice || expired} onClick={() => { setStage("review"); setConfirmed(false); window.scrollTo({ top: 0 }); }}>Review choice</Button>
            </>
          ) : (
            <>
              <Button size="lg" variant="outline" onClick={() => setStage("choose")} disabled={busy}><ArrowLeft /> Back</Button>
              <Button size="lg" className="flex-1" variant="success" disabled={!confirmed || expired} loading={busy} onClick={submit}>Submit final ballot</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
