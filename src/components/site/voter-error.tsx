import { Alert } from "@/components/ui/alert";
import { UrgentContact } from "./urgent-contact";
import type { Lang } from "@/lib/i18n";

/** Any error a voter hits (roll not matching, code problems, ...) comes with the urgent-contact option. */
export function VoterError({ message, lang, className }: { message: string; lang: Lang; className?: string }) {
  return (
    <div className={className} role="group">
      <Alert tone="error">{message}</Alert>
      <UrgentContact lang={lang} className="mt-3" />
    </div>
  );
}
