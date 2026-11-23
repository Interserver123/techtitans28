"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { VoterError } from "@/components/site/voter-error";
import { RuleBanner } from "@/components/site/rule-banner";
import { CandidateAvatar } from "@/components/site/candidate-avatar";
import { cn } from "@/lib/utils";
import { dict, errorText, num, posLabel, type Lang } from "@/lib/i18n";

type Pos = { id: string; code: string; title: string; gender: "MALE" | "FEMALE" | null };
type C = { id: string; position_id: string; display_name: string; roll_number: string; introduction: string; manifesto: string; photo_url: string | null };

/**
 * Two-race ballot: exactly one candidate in EACH position (Boys' CR and Girls' CR).
 * Both choices are reviewed together and submitted in a single request; the server
 * and the database reject anything other than one candidate per position.
 */
export function BallotForm({ positions, candidates, expiresAt, serverNow, lang = "en" }: { positions: Pos[]; candidates: C[]; expiresAt: string; serverNow: string; lang?: Lang }) {
  const router = useRouter();
  const B = dict(lang).ballot;
  const T = dict(lang).cand;
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);
  const [stage, setStage] = useState<"choose" | "review">("choose");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - new Date(serverNow).getTime());
  useEffect(() => {
    const skew = new Date(serverNow).getTime() - Date.now();
    const t = setInterval(() => setLeft(new Date(expiresAt).getTime() - (Date.now() + skew)), 1000);
    return () => clearInterval(t);
  }, [expiresAt, serverNow]);

  const expired = left <= 0;
  const pos = positions[active];
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const choiceFor = (p: Pos) => (selected[p.id] ? byId.get(selected[p.id]) ?? null : null);
  const allChosen = positions.length > 0 && positions.every((p) => selected[p.id]);
  
  const list = useMemo(() => {
    const inPos = candidates.filter((c) => c.position_id === pos?.id);
    const needle = q.trim().toLowerCase();
    return needle ? inPos.filter((c) => c.id === selected[pos?.id ?? ""] || c.display_name.toLowerCase().includes(needle) || c.roll_number.toLowerCase().includes(needle)) : inPos;
  }, [candidates, pos?.id, q, selected]);
  const totalInPos = candidates.filter((c) => c.position_id === pos?.id).length;

  function choose(p: Pos, id: string) {
    setSelected((s) => ({ ...s, [p.id]: id }));
  }

  async function submit() {
    if (!allChosen || !confirmed) return;
    setBusy(true); setError(null);
    const candidateIds = positions.map((p) => selected[p.id]);
    const r = await api("/api/vote/cast", { json: { candidateIds } });
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
    setError(errorText(lang, r.error));
  }

  const mm = Math.max(0, Math.floor(left / 60000));
  const ss = Math.max(0, Math.floor((left % 60000) / 1000));

  return (
    <div className="mt-6 pb-32">
      <div className={cn("mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1", left < 120000 ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-100 text-slate-600 ring-slate-200")}>
        <Clock className="size-3.5" /> {B.session} {expired ? B.expired : B.expiresIn(num(`${mm}:${String(ss).padStart(2, "0")}`, lang))}
      </div>
      {expired && <Alert tone="warning" title={B.expiredTitle} className="mb-4">{B.expiredBody1} <a className="underline" href="/vote">{B.expiredLink}</a>{B.expiredBody2}</Alert>}

      {positions.length > 1 && <RuleBanner lang={lang} className="mb-5" />}

      {stage === "choose" ? (
        <>
          {/* Page indicator: one page per race, in order (not clickable: use Back / Next) */}
          {positions.length > 1 && (
            <ol aria-label={B.legend} className="mb-4 grid grid-cols-2 gap-2">
              {positions.map((p, i) => {
                const c = choiceFor(p);
                return (
                  <li key={p.id} aria-current={i === active ? "step" : undefined}
                    className={cn("rounded-2xl border p-3 transition", i === active ? "border-emerald bg-emerald-50/70 shadow-card ring-2 ring-emerald/15" : "border-line bg-surface")}>
                    <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {B.stepOf(num(i + 1, lang), num(positions.length, lang))}
                      {c ? <span className="flex size-5 items-center justify-center rounded-full bg-success text-white"><Check className="size-3" strokeWidth={3} /></span> : <span className="size-5 rounded-full border-2 border-slate-300" />}
                    </span>
                    <span className="font-display mt-1 block text-base font-bold leading-tight text-ink">{posLabel(p.gender, lang)}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{c ? c.display_name : B.notChosen}</span>
                  </li>
                );
              })}
            </ol>
          )}

          <h2 className="font-display mb-3 text-lg font-bold">{B.chooseFor(posLabel(pos?.gender ?? null, lang, true))}</h2>
          {totalInPos > 0 && (
            <label className="relative mb-4 block">
              <span className="sr-only">{T.search}</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.search}
                className="h-12 w-full rounded-xl border border-line bg-surface pl-11 pr-4 text-[15px] outline-none transition focus:border-emerald focus:ring-4 focus:ring-emerald/15" />
            </label>
          )}
          <fieldset key={pos?.id}>
            <legend className="sr-only">{posLabel(pos?.gender ?? null, lang, true)}</legend>
            {list.length === 0 && <p className="py-6 text-center text-sm text-muted">{T.noMatch}</p>}
            <div className="grid gap-3">
              {list.map((c) => {
                const on = selected[pos!.id] === c.id;
                return (
                  <Card key={c.id} className={cn("overflow-hidden rounded-2xl transition duration-300", on ? "border-electric bg-gradient-to-br from-electric-50/70 to-white shadow-glow ring-4 ring-electric/10" : "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift")}>
                    <label className="flex cursor-pointer items-center gap-4 p-4">
                      <input type="radio" name={`candidate-${pos!.id}`} value={c.id} checked={on} onChange={() => choose(pos!, c.id)} className="peer sr-only" />
                      <CandidateAvatar name={c.display_name} url={c.photo_url} className="size-16 shrink-0 rounded-xl text-lg sm:size-20" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold sm:text-lg">{c.display_name}</p>
                        <p className="text-sm text-muted">{B.roll} {c.roll_number}</p>
                        {c.introduction && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.introduction}</p>}
                      </div>
                      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition peer-focus-visible:ring-4 peer-focus-visible:ring-electric/30", on ? "border-electric bg-electric text-white" : "border-slate-300")}>
                        {on && <Check className="size-4" strokeWidth={3} />}
                      </span>
                    </label>
                    {c.manifesto && (
                      <div className="border-t border-line px-4">
                        <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full items-center justify-between py-2.5 text-sm font-medium text-electric" aria-expanded={open === c.id}>
                          {B.manifesto} <ChevronDown className={cn("size-4 transition", open === c.id && "rotate-180")} />
                        </button>
                        {open === c.id && <p className="whitespace-pre-line pb-4 text-sm leading-relaxed text-slate-700">{c.manifesto}</p>}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </fieldset>
        </>
      ) : (
        <Card className="animate-fade-up p-5 sm:p-8">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted">{B.reviewTitle}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {positions.map((p, i) => {
              const c = choiceFor(p)!;
              return (
                <div key={p.id} className="rounded-2xl border border-gold/40 bg-gradient-to-b from-amber-50/50 to-white p-4 text-center">
                  <p className="font-display text-sm font-bold text-emerald-900">{posLabel(p.gender, lang, true)}</p>
                  <CandidateAvatar name={c.display_name} url={c.photo_url} className="mx-auto mt-3 size-24 rounded-2xl text-2xl" />
                  <p className="mt-3 text-lg font-bold tracking-tight">{c.display_name}</p>
                  <p className="text-sm text-muted">{B.roll} {c.roll_number}</p>
                  <button type="button" onClick={() => { setStage("choose"); setActive(i); setConfirmed(false); }} disabled={busy}
                    className="mt-2 text-xs font-semibold text-electric hover:underline">{B.change}</button>
                </div>
              );
            })}
          </div>
          <label className="mx-auto mt-6 flex max-w-md cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas p-4 text-left text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-5 accent-[#0f7a4f]" />
            <span>{B.confirm1}<strong>{B.final}</strong>{B.confirm2}</span>
          </label>
          {error && <VoterError message={error} lang={lang} className="mt-4 text-left" />}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted"><ShieldCheck className="size-4 text-success" /> {B.separate}</div>
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          {stage === "choose" ? (
            <div className="flex items-center gap-3">
              {active > 0 && (
                <Button size="lg" variant="outline" onClick={() => { setActive(active - 1); setQ(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={expired}><ArrowLeft /> {B.back}</Button>
              )}
              <div className="hidden min-w-0 flex-1 truncate text-xs sm:block">
                <span className="font-semibold text-ink">{pos ? posLabel(pos.gender, lang) : ""}:</span>{" "}
                <span className={selected[pos?.id ?? ""] ? "text-ink" : "text-muted"}>{choiceFor(pos!)?.display_name ?? B.notChosen}</span>
              </div>
              <Button size="lg" className="ml-auto flex-1 sm:flex-none" disabled={expired || !selected[pos?.id ?? ""]}
                onClick={() => {
                  if (active < positions.length - 1) { setActive(active + 1); setQ(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
                  else { setStage("review"); setConfirmed(false); window.scrollTo({ top: 0 }); }
                }}>
                {!selected[pos?.id ?? ""] ? B.selectOne : active < positions.length - 1 ? <>{B.next(posLabel(positions[active + 1].gender, lang))} <ArrowRight /></> : B.review}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button size="lg" variant="outline" onClick={() => setStage("choose")} disabled={busy}><ArrowLeft /> {B.back}</Button>
              <Button size="lg" className="flex-1" variant="success" disabled={!confirmed || expired || !allChosen} loading={busy} onClick={submit}>{B.submit}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
