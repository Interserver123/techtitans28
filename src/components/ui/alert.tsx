import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  info: { cls: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-100", Icon: Info },
  success: { cls: "border-green-200 bg-green-50 text-green-900 dark:border-green-500/25 dark:bg-green-500/10 dark:text-green-100", Icon: CheckCircle2 },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100", Icon: AlertTriangle },
  error: { cls: "border-red-200 bg-red-50 text-red-900 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-100", Icon: XCircle },
};

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof tones; title?: string; children?: React.ReactNode; className?: string }) {
  const { cls, Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}
