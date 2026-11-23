import { SiteHeader } from "@/components/site/site-header";
import { RevealObserver } from "@/components/site/reveal-observer";
import { SiteFooter } from "@/components/site/site-footer";
import { getCurrentElection, isVotingOpen } from "@/lib/services/elections";
import { getPublicSettings } from "@/lib/services/settings";
import { getLang } from "@/lib/i18n-server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [election, settings, lang] = await Promise.all([getCurrentElection(), getPublicSettings(), getLang()]);
  return (
    <div className="flex min-h-dvh flex-col">
      <RevealObserver />
      <SiteHeader status={election?.status ?? null} canVote={election ? isVotingOpen(election) : false} lang={lang} />
      <main className="flex-1">{children}</main>
      <SiteFooter institution={settings.institution} department={settings.department} lang={lang} />
    </div>
  );
}
