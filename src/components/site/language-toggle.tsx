"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { LANG_COOKIE, dict, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** EN ⇄ বাংলা switch. Stores the choice for a year and re-renders the page on the server. */
export function LanguageToggle({ lang, dark = false, className }: { lang: Lang; dark?: boolean; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next: Lang = lang === "bn" ? "en" : "bn";
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = next;
        start(() => router.refresh());
      }}
      aria-label={dict(lang).langSwitchLabel}
      title={dict(lang).langSwitchLabel}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition",
        dark ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-gold/50 bg-amber-50/60 text-emerald-900 hover:bg-amber-100/70",
        pending && "opacity-60",
        className,
      )}
    >
      <Languages className="size-4" aria-hidden />
      <span lang={next}>{dict(lang).langSwitch}</span>
    </button>
  );
}
