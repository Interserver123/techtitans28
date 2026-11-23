import { adminPage } from "@/lib/session";
import { getPublicSettings } from "@/lib/services/settings";
import { PageHeader } from "@/components/admin/ui";
import { SettingsForm } from "./client";

export default async function SettingsPage() {
  await adminPage("settings.manage");
  const s = await getPublicSettings();
  return (
    <div>
      <PageHeader title="Settings" description={`Public Election Committee information. Eligible batch: ${s.batch}.`} />
      <SettingsForm initial={{ committee: s.committee.map((m) => ({ name: m.name, designation: m.designation, contact: m.contact ?? "" })), contact: s.contact }} />
    </div>
  );
}
