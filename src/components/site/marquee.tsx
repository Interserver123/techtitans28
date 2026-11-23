import { cn } from "@/lib/utils";

export function Marquee({ items, className }: { items: React.ReactNode[]; className?: string }) {
  const row = (key: string) => (
    <ul key={key} className="flex shrink-0 items-center gap-12 pr-12" aria-hidden={key === "b"}>
      {items.map((it, i) => <li key={i} className="flex items-center gap-3 whitespace-nowrap">{it}</li>)}
    </ul>
  );
  return (
    <div className={cn("marquee-mask overflow-hidden", className)}>
      <div className="flex w-max animate-marquee">{row("a")}{row("b")}</div>
    </div>
  );
}
