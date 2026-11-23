import { cn } from "@/lib/utils";

/**
 * Decorative band inspired by Bengali alpana floor art: lotus medallions joined
 * by a vine of dots. Pure SVG pattern, scales to any width.
 */
export function Alpana({ className, tone = "gold" }: { className?: string; tone?: "gold" | "emerald" | "light" }) {
  const stroke = tone === "gold" ? "#c9a24a" : tone === "emerald" ? "#0f7a4f" : "rgba(255,255,255,0.55)";
  const id = `alpana-${tone}`;
  return (
    <svg className={cn("block h-7 w-full", className)} aria-hidden focusable="false">
      <defs>
        <pattern id={id} width="56" height="28" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={stroke} strokeWidth="1.1" strokeLinecap="round">
            {/* lotus medallion */}
            <circle cx="28" cy="14" r="2.2" fill={stroke} stroke="none" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <path key={a} d="M28 14 C 30.5 10.5, 30.5 7, 28 5 C 25.5 7, 25.5 10.5, 28 14 Z" transform={`rotate(${a} 28 14)`} />
            ))}
            <circle cx="28" cy="14" r="10.5" strokeDasharray="1 2.6" />
            {/* vine with dots between medallions */}
            <path d="M0 14 Q 4.5 9, 9 14 T 17.5 14" />
            <path d="M38.5 14 Q 43 19, 47.5 14 T 56 14" />
            <circle cx="0" cy="14" r="1.4" fill={stroke} stroke="none" />
            <circle cx="56" cy="14" r="1.4" fill={stroke} stroke="none" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
