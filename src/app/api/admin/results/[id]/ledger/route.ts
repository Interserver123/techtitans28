import { adminRoute } from "@/lib/admin-route";
import { assertUuid } from "@/lib/session";
import { getBallotLedger } from "@/lib/services/results";
import { audit } from "@/lib/audit";

/** Anonymous ballot ledger (ballot ref, candidate, status) — available only after closure. */
export const GET = adminRoute<{ id: string }>("ballots.read", async (_req, { admin, c, params }) => {
  const id = assertUuid(params.id);
  const rows = await getBallotLedger(id);
  await audit({ actorType: "ADMIN", adminId: admin.adminId, action: "EXPORT.BALLOT_LEDGER", entityType: "election", entityId: id, details: { rows: rows.length }, ipHash: c.ipHash });
  const csv = ["ballot_ref,candidate,status"].concat(rows.map((r) => `${r.ballot_ref},"${r.candidate_name.replace(/"/g, '""')}",${r.status}`)).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ballot-ledger-${id.slice(0, 8)}.csv"`, "cache-control": "no-store" },
  });
});
