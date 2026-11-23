"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { unzipSync } from "fflate";
import { CheckCircle2, ImagePlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { useToast } from "@/components/admin/toast";

type Cand = { id: string; rollNumber: string; displayName: string; hasPhoto: boolean };
type Item = { roll: string; file: File; candidate: Cand | null; status: "ready" | "skipped" | "uploading" | "done" | "error"; error?: string };

const IMAGE = /\.(jpe?g|png|webp)$/i;
const MAX = 3 * 1024 * 1024;

/** Roll number from a file name such as "2518011.jpg", "photos/2518011 - Rafi.png". */
function rollFromName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? name;
  const m = base.match(/[A-Za-z0-9-]{3,20}(?=\s*(?:[-_ ].*)?\.(?:jpe?g|png|webp)$)/i) ?? base.match(/\d{5,}/);
  return m ? m[0].toUpperCase() : null;
}

async function expand(files: FileList): Promise<File[]> {
  const out: File[] = [];
  for (const f of Array.from(files)) {
    if (/\.zip$/i.test(f.name)) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => IMAGE.test(e.name) && !e.name.startsWith("__MACOSX") });
      for (const [name, bytes] of Object.entries(entries)) {
        const type = /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg";
        out.push(new File([new Uint8Array(bytes)], name.split("/").pop()!, { type }));
      }
    } else if (IMAGE.test(f.name)) out.push(f);
  }
  return out;
}

/**
 * Bulk candidate photos: files named by roll number (or a .zip of them) are matched
 * to candidates and uploaded one by one through the normal, validated photo endpoint.
 */
export function BulkPhotoUpload({ candidates }: { candidates: Cand[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const byRoll = new Map(candidates.map((c) => [c.rollNumber.toUpperCase(), c]));

  async function choose(files: FileList | null) {
    if (!files?.length) return;
    const all = await expand(files);
    const seen = new Set<string>();
    const next: Item[] = [];
    const bad: string[] = [];
    for (const f of all) {
      const roll = rollFromName(f.name);
      const c = roll ? byRoll.get(roll) ?? null : null;
      if (!c || seen.has(c.id)) { bad.push(f.name); continue; }
      seen.add(c.id);
      next.push({ roll: roll!, file: f, candidate: c, status: f.size > MAX ? "error" : "ready", error: f.size > MAX ? "৩ MB-এর বেশি" : undefined });
    }
    next.sort((a, b) => a.roll.localeCompare(b.roll));
    setItems(next);
    setUnmatched(bad);
    setDone(0);
  }

  const queue = items.filter((i) => i.status === "ready" && (replace || !i.candidate!.hasPhoto));
  const noPhoto = candidates.filter((c) => !c.hasPhoto && !items.some((i) => i.candidate?.id === c.id));

  async function upload() {
    setBusy(true);
    let ok = 0;
    for (const it of queue) {
      setItems((xs) => xs.map((x) => (x === it ? { ...x, status: "uploading" } : x)));
      const fd = new FormData();
      fd.set("photo", it.file);
      const r = await api(`/api/admin/candidates/${it.candidate!.id}/photo`, { form: fd });
      if (r.ok) ok++;
      setItems((xs) => xs.map((x) => (x.file === it.file ? { ...x, status: r.ok ? "done" : "error", error: r.ok ? undefined : r.error.message } : x)));
      setDone((d) => d + 1);
      if (!r.ok && (r.error.code === "UNAUTHENTICATED" || r.error.code === "MFA_REQUIRED" || r.error.code === "CANDIDATES_LOCKED")) break;
    }
    setBusy(false);
    toast(ok === queue.length ? "success" : "error", `${queue.length}টির মধ্যে ${ok}টি ছবি আপলোড হয়েছে`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); if (!o) { setItems([]); setUnmatched([]); } } }}>
      <DialogTrigger asChild><Button variant="outline"><ImagePlus /> একসাথে ছবি</Button></DialogTrigger>
      <DialogContent wide title="একসাথে প্রার্থীদের ছবি আপলোড"
        description={<>একটি <code>.zip</code> অথবা রোল নম্বর দিয়ে নাম দেওয়া একাধিক JPEG/PNG/WebP ফাইল বেছে নিন, যেমন <code>2518011.jpg</code>। প্রতিটি ছবি সার্ভারে যাচাই, পুনঃএনকোড ও ক্রপ করা হয়।</>}>
        <div className="space-y-4">
          <Input type="file" multiple accept=".zip,image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => void choose(e.target.files)}
            className="h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-electric file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
          {items.length > 0 && (
            <>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-300">
                <span><strong className="text-white">{items.length}</strong>টি মিলেছে</span>
                <span><strong className="text-white">{items.filter((i) => i.candidate!.hasPhoto).length}</strong> জনের আগে থেকেই ছবি আছে</span>
                {unmatched.length > 0 && <span className="text-amber-300">{unmatched.length}টি ফাইল মেলেনি</span>}
                {noPhoto.length > 0 && <span className="text-slate-400">{noPhoto.length} জন প্রার্থীর ফাইল নেই</span>}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} disabled={busy} className="size-4 accent-[#0f7a4f]" />
                বিদ্যমান ছবি প্রতিস্থাপন করুন
              </label>
              {busy || done > 0 ? <Progress value={(done / Math.max(1, queue.length)) * 100} label="আপলোডের অগ্রগতি" /> : null}
              <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-navy-700 text-left text-slate-400"><tr><th className="px-3 py-2">রোল</th><th className="px-3 py-2">প্রার্থী</th><th className="px-3 py-2">অবস্থা</th></tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {items.map((i) => (
                      <tr key={i.file.name}>
                        <td className="px-3 py-1.5 font-mono text-slate-300">{i.roll}</td>
                        <td className="px-3 py-1.5 text-slate-200">{i.candidate!.displayName}</td>
                        <td className="px-3 py-1.5">
                          {i.status === "done" ? <span className="inline-flex items-center gap-1 text-green-400"><CheckCircle2 className="size-3.5" /> আপলোড হয়েছে</span>
                            : i.status === "error" ? <span className="inline-flex items-center gap-1 text-red-300"><XCircle className="size-3.5" /> {i.error}</span>
                            : i.status === "uploading" ? <span className="text-blue-300">আপলোড হচ্ছে…</span>
                            : !replace && i.candidate!.hasPhoto ? <span className="text-slate-500">বর্তমান ছবি থাকবে</span>
                            : <span className="text-slate-400">প্রস্তুত</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {unmatched.length > 0 && <Alert tone="warning" title="কোনো প্রার্থীর সাথে মেলেনি">{unmatched.slice(0, 8).join(", ")}{unmatched.length > 8 ? "…" : ""}। ফাইলের নাম অবশ্যই প্রার্থীর রোল নম্বর হতে হবে।</Alert>}
              {noPhoto.length > 0 && <p className="text-xs text-slate-500">এখনও ছবি নেই: {noPhoto.map((c) => `${c.displayName} (${c.rollNumber})`).join(", ")}</p>}
              <Button className="w-full" loading={busy} disabled={queue.length === 0} onClick={upload}>
                {busy ? `আপলোড হচ্ছে ${done} / ${queue.length}…` : `${queue.length}টি ছবি আপলোড করুন`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
