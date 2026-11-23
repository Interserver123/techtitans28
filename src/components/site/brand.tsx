import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Image src="/campus/logo.png" alt="ইসলামী বিশ্ববিদ্যালয়ের লোগো" width={72} height={68} priority className={cn("size-10 rounded-xl object-cover ring-1 ring-gold/60", className)} />
  );
}

export function Brand({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label="টেকটাইটানস-২৮ সিআর নির্বাচন — প্রথম পাতা">
      <BrandMark />
      <span className="leading-tight">
        <span className={cn("block font-display text-[17px] font-bold tracking-tight", dark ? "text-white" : "text-ink")}>TechTitans-28</span>
        <span className={cn("block text-[11px] font-medium", dark ? "text-slate-400" : "text-muted")}>আইসিটি · ইসলামী বিশ্ববিদ্যালয়, কুষ্টিয়া</span>
      </span>
    </Link>
  );
}
