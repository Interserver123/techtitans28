import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9", className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#0B1220" />
      <path d="M18 20h20v6h-7v20h-6V26h-7z" fill="#fff" />
      <path d="M36 30h10v-6h6v6h-2v4h-4v12h-6V34h-4z" fill="#3B82F6" />
    </svg>
  );
}

export function Brand({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label="TechTitans-28 CR Election home">
      <BrandMark className={dark ? "ring-1 ring-white/15 rounded-[10px]" : ""} />
      <span className="leading-tight">
        <span className={cn("block text-[15px] font-bold tracking-tight", dark ? "text-white" : "text-ink")}>TechTitans-28</span>
        <span className={cn("block text-[11px] font-medium", dark ? "text-slate-400" : "text-muted")}>ICT · Islamic University</span>
      </span>
    </Link>
  );
}
