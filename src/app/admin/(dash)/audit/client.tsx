"use client";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";

const PREFIXES = ["", "ADMIN.", "ELECTION.", "STUDENT.", "CANDIDATE.", "VOTES.", "VOTE.", "CORRECTION.", "RESULTS.", "EXPORT.", "DISPUTE.", "VOTER.", "SETTINGS."];

export function AuditFilter({ initial, actor, actors }: { initial: string; actor: string; actors: { id: string; name: string }[] }) {
  const router = useRouter();
  const go = (action: string, who: string) => {
    const qs = new URLSearchParams({ ...(action ? { action } : {}), ...(who ? { actor: who } : {}) }).toString();
    router.push(qs ? `/admin/audit?${qs}` : "/admin/audit");
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select className="h-10 sm:w-60" aria-label="কাজ অনুযায়ী ছাঁকুন" value={initial} onChange={(e) => go(e.target.value, actor)}>
        {PREFIXES.map((p) => <option key={p} value={p}>{p ? p.replace(".", "") : "সব কাজ"}</option>)}
      </Select>
      <Select className="h-10 sm:w-60" aria-label="অ্যাডমিন অনুযায়ী ছাঁকুন" value={actor} onChange={(e) => go(initial, e.target.value)}>
        <option value="">সব অ্যাডমিন</option>
        {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
    </div>
  );
}
