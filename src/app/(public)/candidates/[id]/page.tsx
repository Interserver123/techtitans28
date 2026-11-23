import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Vote } from "lucide-react";
import { getPublicCandidate } from "@/lib/services/voting";
import { CandidateAvatar } from "@/components/site/candidate-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bn } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = /^[0-9a-f-]{36}$/i.test(id) ? await getPublicCandidate(id) : null;
  return { title: c ? `${c.display_name} — প্রার্থী` : "প্রার্থী" };
}

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await getPublicCandidate(id);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/#candidates" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> সকল প্রার্থী
      </Link>
      <Card className="mt-6 overflow-hidden">
        <div className="grid md:grid-cols-[300px_1fr]">
          <CandidateAvatar name={c.display_name} url={c.photo_url} className="aspect-square w-full md:h-full" />
          <div className="p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">প্রার্থী · ক্লাস রিপ্রেজেন্টেটিভ (সিআর)</p>
            <h1 className="font-display mt-2 text-3xl font-bold">{c.display_name}</h1>
            <p className="mt-1 text-sm text-muted">বিশ্ববিদ্যালয় রোল {bn(c.roll_number)} · {c.election_title}</p>
            {c.introduction && <p className="mt-5 text-[15px] leading-relaxed text-slate-700">{c.introduction}</p>}
            <Button asChild className="mt-6" size="lg"><Link href="/vote"><Vote /> ভোটার পোর্টালে যান</Link></Button>
          </div>
        </div>
      </Card>
      <Card className="mt-6 p-6 sm:p-8">
        <h2 className="text-lg font-semibold">ইশতেহার</h2>
        <div className="mt-4 whitespace-pre-line text-[15px] leading-7 text-slate-700">{c.manifesto || "প্রার্থী এখনো ইশতেহার প্রকাশ করেননি।"}</div>
      </Card>
    </div>
  );
}
