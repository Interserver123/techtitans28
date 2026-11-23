import { adminPage } from "@/lib/session";
import { getWelcomeTemplate } from "@/lib/services/settings";
import { dict } from "@/lib/i18n";
import { PageHeader } from "@/components/admin/ui";
import { WelcomeForm } from "./client";

export default async function WelcomePage() {
  await adminPage("settings.manage");
  const welcome = await getWelcomeTemplate();
  return (
    <div>
      <PageHeader title="স্বাগত বার্তা" description="ভোট দেওয়ার পর প্রত্যেক ভোটার নিজের নামসহ এই বার্তাটি দেখবেন।" />
      <WelcomeForm initial={welcome ?? ""} defaultText={dict("bn").receipt.welcomeDefault} />
    </div>
  );
}
