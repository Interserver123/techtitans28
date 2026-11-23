import { cn } from "@/lib/utils";

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function CandidateAvatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`Photograph of ${name}`} className={cn("object-cover", className)} loading="lazy" decoding="async" />;
  }
  return (
    <div className={cn("flex items-center justify-center bg-gradient-to-br from-navy-700 to-navy text-2xl font-bold text-white", className)} aria-label={`${name} (no photograph)`}>
      {initials(name)}
    </div>
  );
}
