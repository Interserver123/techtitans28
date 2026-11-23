import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { getCurrentElection, isVotingOpen } from "@/lib/services/elections";
import { getPublicSettings } from "@/lib/services/settings";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [election, settings] = await Promise.all([getCurrentElection(), getPublicSettings()]);
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader status={election?.status ?? null} canVote={election ? isVotingOpen(election) : false} />
      <main className="flex-1">{children}</main>
      <SiteFooter institution={settings.institution} department={settings.department} />
    </div>
  );
}
