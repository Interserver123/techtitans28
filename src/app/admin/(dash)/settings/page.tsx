import { adminPage } from "@/lib/session";
import { getPublicSettings } from "@/lib/services/settings";
import { PageHeader } from "@/components/admin/ui";
import { otpStatus } from "@/lib/otp/provider";
import { EmailCheck, SettingsForm } from "./client";

export default async function SettingsPage() {
  await adminPage("settings.manage");
  const s = await getPublicSettings();
  return (
    <div>
      <PageHeader title="সেটিংস" description={`নির্বাচন কমিটির পাবলিক তথ্য। যোগ্য ব্যাচ: ${s.batch}।`} />
      <EmailCheck status={otpStatus()} />
      <SettingsForm initial={{ committee: s.committee.map((m) => ({ name: m.name, designation: m.designation, contact: m.contact ?? "" })), contact: s.contact }} />
    </div>
  );
}
