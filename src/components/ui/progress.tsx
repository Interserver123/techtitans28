import { cn } from "@/lib/utils";

export function Progress({ value, className, barClassName, label }: { value: number; className?: string; barClassName?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10", className)}>
      <div className={cn("h-full rounded-full bg-electric transition-[width] duration-700 ease-out", barClassName)} style={{ width: `${v}%` }} />
    </div>
  );
}
