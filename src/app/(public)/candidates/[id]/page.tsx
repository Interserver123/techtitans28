import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Vote } from "lucide-react";
import { getPublicCandidate } from "@/lib/services/voting";
import { CandidateAvatar } from "@/components/site/candidate-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = /^[0-9a-f-]{36}$/i.test(id) ? await getPublicCandidate(id) : null;
  return { title: c ? `${c.display_name} — Candidate` : "Candidate" };
}

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await getPublicCandidate(id);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/#candidates" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All candidates
      </Link>
      <Card className="mt-6 overflow-hidden">
        <div className="grid md:grid-cols-[300px_1fr]">
          <CandidateAvatar name={c.display_name} url={c.photo_url} className="aspect-square w-full md:h-full" />
          <div className="p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Candidate · Class Representative</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{c.display_name}</h1>
            <p className="mt-1 text-sm text-muted">University roll {c.roll_number} · {c.election_title}</p>
            {c.introduction && <p className="mt-5 text-[15px] leading-relaxed text-slate-700">{c.introduction}</p>}
            <Button asChild className="mt-6" size="lg"><Link href="/vote"><Vote /> Go to voter portal</Link></Button>
          </div>
        </div>
      </Card>
      <Card className="mt-6 p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Manifesto</h2>
        <div className="mt-4 whitespace-pre-line text-[15px] leading-7 text-slate-700">{c.manifesto || "The candidate has not published a manifesto yet."}</div>
      </Card>
    </div>
  );
}
