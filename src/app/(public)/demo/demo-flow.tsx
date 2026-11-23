"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FlaskConical, Mail, RotateCcw, Search } from "lucide-react";
import { api } from "@/lib/client";
import { dict, errorText, num, posLabel, type Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { initials } from "@/components/site/candidate-avatar";
import { cn } from "@/lib/utils";

type C = { id: string; pos: string; name: string; roll: string; photo: string | null };
type Step = "email" | "code" | "choose" | "review" | "done";
const latin = (v: string) => v.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));

export function DemoFlow({ candidates, positions, lang }: { candidates: C[]; positions: { id: string; gender: "MALE" | "FEMALE" | null }[]; lang: Lang }) {
  const t = dict(lang).demo;
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [choices, setChoices] = useState<Record<string, C>>({});
  const [tab, setTab] = useState(0);
  const [ack, setAck] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const posId = positions[tab]?.id;
  const allChosen = positions.length > 0 && positions.every((p) => choices[p.id]);
  const nextUnchosen = positions.findIndex((p) => !choices[p.id]);
  const shown = useMemo(() => {
    const s = latin(q.trim().toLowerCase());
    const inPos = positions.length > 1 ? candidates.filter((c) => c.pos === posId) : candidates;
    return s ? inPos.filter((c) => c.name.toLowerCase().includes(s) || c.roll.toLowerCase().includes(s)) : inPos;
  }, [q, candidates, positions, posId]);

  const call = async <T,>(url: string, json: unknown, then: (r: T) => void) => {
    setBusy(true); setError(null);
    const r = await api<T>(url, { json });
    setBusy(false);
    if (r.ok) then(r); else setError(errorText(lang, r.error));
  };
  const restart = () => { setStep("email"); setCode(""); setChoices({}); setTab(0); setAck(false); setReceipt(""); setError(null); };

  return (
    <Card className="mt-8 overflow-hidden rounded-3xl">
      <div className="flex items-center gap-2 border-b border-line bg-gradient-to-r from-amber-50 to-white px-5 py-3 text-xs font-semibold text-[#8a6a22]">
        <FlaskConical className="size-4" /> {t.banner}
      </div>
      <div className="p-5 sm:p-7">
        {step === "email" && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void call<{ token: string }>("/api/demo/request-code", { email }, (r) => { setToken(r.token); setStep("code"); }); }}>
            <Field label={t.emailLabel} htmlFor="demo-email">
              <Input id="demo-email" type="email" required autoComplete="email" placeholder={t.emailPh} value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="lg" className="w-full" loading={busy}><Mail /> {t.send}</Button>
          </form>
        )}

        {step === "code" && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void call<{ receipt: string }>("/api/demo/verify", { token, code }, (r) => { setReceipt(r.receipt); setStep("choose"); }); }}>
            <Alert tone="info">{t.sentTo(email)}</Alert>
            <Field label={t.codeLabel} htmlFor="demo-code">
              <Input id="demo-code" value={code} onChange={(e) => setCode(latin(e.target.value).replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" className="h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]" required />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>{t.verify} <ArrowRight /></Button>
            <button type="button" onClick={restart} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> {t.other}</button>
          </form>
        )}

        {step === "choose" && (
          candidates.length === 0 ? <p className="text-center text-muted">{t.noCandidates}</p> : (
            <div>
              <h2 className="font-display text-xl font-bold">{t.choose}</h2>
              {positions.length > 1 && (
                <div role="tablist" className="mt-4 grid grid-cols-2 gap-2">
                  {positions.map((p, i) => (
                    <button key={p.id} type="button" role="tab" aria-selected={i === tab} onClick={() => { setTab(i); setQ(""); }}
                      className={cn("rounded-2xl border p-3 text-left transition", i === tab ? "border-emerald bg-emerald/5 ring-2 ring-emerald/15" : "border-line hover:border-gold/60")}>
                      <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">{num(i + 1, lang)}/{num(positions.length, lang)}
                        {choices[p.id] ? <Check className="size-4 text-emerald" strokeWidth={3} /> : <span className="size-4 rounded-full border-2 border-slate-300" />}</span>
                      <span className="font-display block text-base font-bold">{posLabel(p.gender, lang)}</span>
                      <span className="block truncate text-xs text-slate-500">{choices[p.id]?.name ?? "—"}</span>
                    </button>
                  ))}
                </div>
              )}
              <label className="relative mt-4 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} className="h-11 pl-9" />
              </label>
              <ul className="mt-4 grid max-h-[26rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {shown.map((c) => {
                  const on = choices[posId ?? ""]?.id === c.id;
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => setChoices((x) => ({ ...x, [posId ?? ""]: c }))} aria-pressed={on}
                        className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition", on ? "border-emerald bg-emerald/5 ring-4 ring-emerald/10" : "border-line hover:border-gold/60")}>
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald to-emerald-900 text-sm font-bold text-white">{initials(c.name)}</span>
                        <span className="min-w-0 flex-1"><span className="line-clamp-2 block text-sm font-semibold">{c.name}</span><span className="text-xs text-muted">{t.roll} {num(c.roll, lang)}</span></span>
                        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2", on ? "border-emerald bg-emerald text-white" : "border-slate-300")}>{on && <Check className="size-3.5" strokeWidth={3} />}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {allChosen ? (
                <Button size="lg" className="mt-5 w-full" onClick={() => setStep("review")}>{t.review} <ArrowRight /></Button>
              ) : (
                <Button size="lg" className="mt-5 w-full" disabled={!choices[posId ?? ""] || nextUnchosen < 0} onClick={() => { setTab(nextUnchosen); setQ(""); }}>
                  {nextUnchosen >= 0 ? <>{dict(lang).ballot.next(posLabel(positions[nextUnchosen].gender, lang))} <ArrowRight /></> : t.review}
                </Button>
              )}
            </div>
          )
        )}

        {step === "review" && allChosen && (
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{t.reviewTitle}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {positions.map((p) => {
                const c = choices[p.id];
                return (
                  <div key={p.id} className="rounded-2xl border border-gold/40 bg-amber-50/40 p-4">
                    <p className="font-display text-sm font-bold text-emerald-900">{posLabel(p.gender, lang, true)}</p>
                    <span className="mx-auto mt-3 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald to-emerald-900 text-xl font-bold text-white">{initials(c.name)}</span>
                    <p className="font-display mt-2 text-lg font-bold">{c.name}</p>
                    <p className="text-xs text-muted">{t.roll} {num(c.roll, lang)}</p>
                  </div>
                );
              })}
            </div>
            <label className="mx-auto mt-5 flex max-w-md cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas p-4 text-left text-sm">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-5 accent-[#0f7a4f]" /> {t.confirm}
            </label>
            <div className="mt-5 flex gap-3">
              <Button variant="outline" size="lg" onClick={() => setStep("choose")}><ArrowLeft /> {t.back}</Button>
              <Button variant="success" size="lg" className="flex-1" disabled={!ack} onClick={() => setStep("done")}>{t.submit}</Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-gold text-navy"><FlaskConical className="size-7" /></span>
            <h2 className="font-display mt-4 text-2xl font-bold">{t.doneTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.done}</p>
            <div className="mx-auto mt-5 max-w-sm rounded-2xl border border-dashed border-gold/60 bg-amber-50/60 p-4">
              <p className="text-xs font-semibold text-muted">{t.receipt}</p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wider">{receipt}</p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={restart}><RotateCcw /> {t.again}</Button>
              <Button asChild variant="navy" className="flex-1"><Link href="/vote">{t.realVote}</Link></Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
