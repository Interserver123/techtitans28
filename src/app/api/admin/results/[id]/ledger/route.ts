import { adminRoute } from "@/lib/admin-route";
import { assertUuid } from "@/lib/session";
import { getBallotLedger } from "@/lib/services/results";
import { audit } from "@/lib/audit";

/** Anonymous ballot ledger (ballot ref, candidate, status) — available only after closure. */
export const GET = adminRoute<{ id: string }>("ballots.read", async (_req, { admin, c, params }) => {
  const id = assertUuid(params.id);
  const rows = await getBallotLedger(id);
  await audit({ actorType: "ADMIN", adminId: admin.adminId, action: "EXPORT.BALLOT_LEDGER", entityType: "election", entityId: id, details: { rows: rows.length }, ipHash: c.ipHash });
  // replaces_ballot_ref: set on a replacement ballot added by an approved vote correction (the original stays, invalidated).
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = ["ballot_ref,position,candidate,status,last_correction_id,replaces_ballot_ref,created_by_correction_id"]
    .concat(rows.map((r) => [r.ballot_ref, q(r.position_title), q(r.candidate_name), r.status, r.last_correction_id ?? "", r.replaces_ballot_ref ?? "", r.created_by_correction_id ?? ""].join(",")))
    .join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ballot-ledger-${id.slice(0, 8)}.csv"`, "cache-control": "no-store" },
  });
}, { stepUp: true });
