"use client";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";

const PREFIXES = ["", "ADMIN.", "ELECTION.", "STUDENT.", "CANDIDATE.", "CORRECTION.", "RESULTS.", "EXPORT.", "DISPUTE.", "VOTER.", "SETTINGS."];

export function AuditFilter({ initial }: { initial: string }) {
  const router = useRouter();
  return (
    <Select className="h-10 sm:w-60" aria-label="কাজ অনুযায়ী ছাঁকুন" value={initial} onChange={(e) => router.push(e.target.value ? `/admin/audit?action=${e.target.value}` : "/admin/audit")}>
      {PREFIXES.map((p) => <option key={p} value={p}>{p ? p.replace(".", "") : "সব কাজ"}</option>)}
    </Select>
  );
}
