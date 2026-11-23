"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { VoterError } from "@/components/site/voter-error";
import { dict, errorText, type Lang } from "@/lib/i18n";

const latinDigits = (v: string) => v.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));

export function LinkLogin({ token, lang }: { token: string; lang: Lang }) {
  const L = dict(lang).link;
  const V = dict(lang).vote;
  const router = useRouter();
  const [roll, setRoll] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await api<{ next: string }>("/api/vote/link-login", { json: { token, roll } });
    if (!r.ok) { setBusy(false); return setError(errorText(lang, r.error)); }
    router.replace(r.next);
    router.refresh();
  }

  return (
    <form onSubmit={go} className="animate-fade-up space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><KeyRound className="size-6 text-electric" /> {L.title}</h1>
        <p className="mt-2 text-sm text-muted">{L.sub}</p>
      </div>
      <p className="text-xs leading-relaxed text-muted">{dict("en").openBallot.notice} <Link href="/terms" className="font-semibold underline">{dict("en").openBallot.terms}</Link></p>
      <Field label={V.rollLabel} htmlFor="link-roll">
        <Input id="link-roll" value={roll} onChange={(e) => setRoll(latinDigits(e.target.value).toUpperCase().replace(/\s/g, ""))} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={V.rollPh} maxLength={20} required className="h-12 text-lg font-semibold tracking-wide" />
      </Field>
      {error && <VoterError message={error} lang={lang} />}
      <Button type="submit" size="xl" className="w-full bg-gradient-to-r from-emerald to-emerald-900 shadow-glow hover:brightness-110" loading={busy} disabled={roll.length < 3}>{L.cta} <ArrowRight /></Button>
      <p className="text-center text-xs text-muted">{L.note}</p>
    </form>
  );
}
