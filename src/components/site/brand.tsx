import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { dict, type Lang } from "@/lib/i18n";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Image src="/campus/logo.png" alt="Islamic University logo" width={72} height={68} priority className={cn("size-10 rounded-xl object-cover ring-1 ring-gold/60", className)} />
  );
}

export function Brand({ dark = false, href = "/", lang = "en" }: { dark?: boolean; href?: string; lang?: Lang }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label="TechTitans-28 CR Election home">
      <BrandMark />
      <span className="leading-tight">
        <span className={cn("block font-display text-[17px] font-bold tracking-tight", dark ? "text-white" : "text-ink")}>TechTitans-28</span>
        <span className={cn("block text-[11px] font-medium", dark ? "text-slate-400" : "text-muted")}>{dict(lang).brandSub}</span>
      </span>
    </Link>
  );
}
