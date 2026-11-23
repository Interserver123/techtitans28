import { adminRoute } from "@/lib/admin-route";
import { auditExport } from "@/lib/services/records-export";

/** Full administrative activity log with the exact hashed strings (verify offline: scripts/verify-records.mjs). */
export const GET = adminRoute("audit.read", async (_req, { admin, c }) => {
  const data = await auditExport(admin.adminId, c.ipHash);
  return new Response(JSON.stringify(data, null, 1), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}, { stepUp: true });
