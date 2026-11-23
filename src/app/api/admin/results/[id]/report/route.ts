import { adminRoute } from "@/lib/admin-route";
import { assertUuid } from "@/lib/session";
import { buildResultReport } from "@/lib/services/report";
import { audit } from "@/lib/audit";

export const GET = adminRoute<{ id: string }>("results.view", async (_req, { admin, c, params }) => {
  const id = assertUuid(params.id);
  const pdf = await buildResultReport(id);
  await audit({ actorType: "ADMIN", adminId: admin.adminId, action: "EXPORT.RESULT_REPORT", entityType: "election", entityId: id, ipHash: c.ipHash });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="cr-election-report-${id.slice(0, 8)}.pdf"`, "cache-control": "no-store" },
  });
});
