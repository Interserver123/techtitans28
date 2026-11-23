import { adminPage } from "@/lib/session";
import { getAdminElections } from "@/lib/admin-context";
import { AdminShell } from "@/components/admin/shell";
import { ROLE_LABELS } from "@/lib/permissions";

export const metadata = { title: "অ্যাডমিন", robots: { index: false } };

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const admin = await adminPage(null);
  const { elections, selected } = await getAdminElections();
  return (
    <AdminShell
      admin={{ name: admin.fullName, email: admin.email, role: ROLE_LABELS[admin.role], permissions: [...admin.permissions] }}
      elections={elections.map((e) => ({ id: e.id, title: e.title, status: e.status }))}
      selectedId={selected?.id ?? null}
    >
      {children}
    </AdminShell>
  );
}
