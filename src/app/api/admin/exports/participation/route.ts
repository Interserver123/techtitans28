import { adminRoute } from "@/lib/admin-route";
import { AppError } from "@/lib/errors";
import { getAdminElections } from "@/lib/admin-context";
import { participationCsv } from "@/lib/services/records-export";

/** Who voted and when — participation only, never ballot contents. */
export const GET = adminRoute("students.export", async (_req, { admin, c }) => {
  const { selected } = await getAdminElections();
  if (!selected) throw new AppError("NO_ELECTION");
  const csv = await participationCsv(selected.id, admin.adminId, c.ipHash);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="participation-${selected.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}, { stepUp: true });
