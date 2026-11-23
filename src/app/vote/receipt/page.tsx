import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { voterFromCookies } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";
import { SignOutButton } from "./sign-out";
import { getDict } from "@/lib/i18n-server";
import { dict } from "@/lib/i18n";
import { getWelcomeTemplate, renderWelcome } from "@/lib/services/settings";
import { voteChangedAt } from "@/lib/services/vote-records";
import { Alert } from "@/components/ui/alert";

export default async function ReceiptPage() {
  const s = await voterFromCookies();
  if (!s) redirect("/vote");
  if (!s.hasVoted) redirect("/vote/ballot");
  const { lang, t } = await getDict();
  const R = t.receipt;
  const changedAt = await voteChangedAt(s.studentId, s.electionId);
  const welcome = renderWelcome((await getWelcomeTemplate()) ?? R.welcomeDefault, { name: s.fullName, roll: s.rollNumber });
  return (
    <Card className="animate-fade-up overflow-hidden rounded-3xl shadow-elite">
      <div className="noise relative overflow-hidden bg-navy px-6 py-12 text-center text-white"><div className="aurora opacity-70" aria-hidden />
        <div className="animate-pop relative mx-auto flex size-16 items-center justify-center rounded-full bg-success shadow-lg shadow-green-600/40">
          <CheckCircle2 className="size-9" />
        </div>
        <h1 className="font-display relative mt-5 text-2xl font-extrabold tracking-tight sm:text-3xl">{R.title}</h1>
        <p className="relative mt-1 text-sm text-slate-400">{R.thanks(s.electionTitle)}</p>
      </div>
      <div className="space-y-5 p-6 sm:p-8">
        {changedAt && <Alert tone="warning" title={dict(lang).openBallot.terms}>{dict(lang).openBallot.changed(fmtDateTime(changedAt, {}, lang))}</Alert>}
        <p data-testid="welcome" className="whitespace-pre-line rounded-2xl border border-gold/40 bg-gradient-to-br from-amber-50/70 to-white p-5 text-center text-[15px] font-medium leading-relaxed text-emerald-900">{welcome}</p>
        <div className="rounded-2xl border border-dashed border-gold/60 bg-gradient-to-br from-amber-50/60 to-white p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{R.id}</p>
          <p className="mt-2 select-all font-mono text-xl font-bold tracking-wider sm:text-2xl" data-testid="receipt-code">{s.receiptCode}</p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl bg-canvas p-4"><dt className="text-muted">{R.submitted}</dt><dd className="mt-0.5 font-semibold">{fmtDateTime(s.votedAt, {}, lang)}</dd></div>
          <div className="rounded-xl bg-canvas p-4"><dt className="text-muted">{R.voter}</dt><dd className="mt-0.5 font-semibold">{s.rollNumber}</dd></div>
          <div className="rounded-xl bg-canvas p-4"><dt className="text-muted">{R.status}</dt><dd className="mt-0.5 font-semibold text-success">{R.complete}</dd></div>
        </dl>
        <p className="text-center text-xs leading-relaxed text-muted">
          {R.note1}<Link className="text-electric hover:underline" href="/verify-receipt">{R.verify}</Link>.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="outline" className="flex-1"><Link href="/results">{R.turnout}</Link></Button>
          <SignOutButton label={R.signout} />
        </div>
      </div>
    </Card>
  );
}
