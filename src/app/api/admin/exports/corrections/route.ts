import { adminRoute } from "@/lib/admin-route";
import { AppError } from "@/lib/errors";
import { getAdminElections } from "@/lib/admin-context";
import { correctionsExport } from "@/lib/services/records-export";

/** Correction record: every request and decision, its audit entries and the anonymous ballot ledger. */
export const GET = adminRoute("corrections.read", async (_req, { admin, c }) => {
  const { selected } = await getAdminElections();
  if (!selected) throw new AppError("NO_ELECTION");
  const data = await correctionsExport(selected.id, admin.adminId, c.ipHash);
  return new Response(JSON.stringify(data, null, 1), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="corrections-${selected.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}, { stepUp: true });
