import "server-only";
import { z } from "zod";
import { query, one, tx } from "../db";
import { AppError, fromDbError } from "../errors";
import { audit } from "../audit";
import { putObject, validateEvidence } from "../storage";

export const correctionSchema = z.object({
  ballotRef: z.string().trim().toUpperCase().regex(/^B-[A-F0-9]{16}$/, "Enter a valid ballot reference (B-…)."),
  correction: z.enum(["INVALIDATE_BALLOT", "REINSTATE_BALLOT"]),
  reason: z.string().trim().min(20, "Explain the reason in at least 20 characters.").max(2000),
  evidenceNote: z.string().trim().max(2000).optional().default(""),
});

export type CorrectionRow = {
  id: string;
  election_id: string;
  ballot_ref: string;
  ballot_status: string;
  correction: "INVALIDATE_BALLOT" | "REINSTATE_BALLOT";
  reason: string;
  evidence_note: string | null;
  evidence_path: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  requested_by: string;
  requester_name: string;
  requested_at: Date;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  ballot_status_before: string | null;
};

export async function listCorrections(electionId: string) {
  return query<CorrectionRow>(
    `select r.id, r.election_id, b.ballot_ref, b.status as ballot_status, r.correction, r.reason, r.evidence_note, r.evidence_path,
            r.status, r.requested_by, ra.full_name as requester_name, r.requested_at, r.reviewed_by, rv.full_name as reviewer_name,
            r.reviewed_at, r.review_note, r.ballot_status_before
       from correction_requests r
       join election_admins ra on ra.id = r.requested_by
       left join election_admins rv on rv.id = r.reviewed_by
       join lateral (select l.ballot_ref, l.status from ballot_ledger(r.election_id) l where l.ballot_id = r.ballot_id) b on true
      where r.election_id = $1
      order by r.requested_at desc`,
    [electionId],
  );
}

export async function createCorrection(
  electionId: string,
  input: z.input<typeof correctionSchema>,
  evidence: Buffer | null,
  adminId: string,
  ipHash: string | null,
) {
  const v = correctionSchema.parse(input);
  const el = await one<{ status: string }>(`select status from elections where id = $1`, [electionId]);
  if (!el) throw new AppError("NOT_FOUND");
  if (el.status !== "CLOSED") throw new AppError("INVALID_STATE", "Corrections can only be requested after the election closes and before results are published.");
  const ballot = await one<{ ballot_id: string; status: string }>(
    `select ballot_id, status from ballot_ledger($1) where ballot_ref = $2`, [electionId, v.ballotRef]);
  if (!ballot) throw new AppError("NOT_FOUND", "No ballot with this reference exists in this election.");
  if (v.correction === "INVALIDATE_BALLOT" && ballot.status !== "VALID") throw new AppError("INVALID_STATE", "This ballot is already invalidated.");
  if (v.correction === "REINSTATE_BALLOT" && ballot.status !== "INVALIDATED") throw new AppError("INVALID_STATE", "Only invalidated ballots can be reinstated.");
  let evidencePath: string | null = null;
  if (evidence && evidence.length) {
    const kind = validateEvidence(evidence);
    evidencePath = await putObject("evidence", evidence, kind);
  }
  try {
    return await tx(async (c) => {
      const row = await one<{ id: string }>(
        `insert into correction_requests (election_id, ballot_id, correction, reason, evidence_note, evidence_path, requested_by)
         values ($1, $2, $3, $4, nullif($5, ''), $6, $7) returning id`,
        [electionId, ballot.ballot_id, v.correction, v.reason, v.evidenceNote, evidencePath, adminId],
        c,
      );
      await audit({
        actorType: "ADMIN", adminId, action: "CORRECTION.REQUESTED", entityType: "correction_request", entityId: row!.id,
        details: { ballot_ref: v.ballotRef, correction: v.correction, reason: v.reason, evidence: Boolean(evidencePath) }, ipHash,
      }, c);
      return row!.id;
    });
  } catch (e) {
    const m = fromDbError(e);
    if (m?.code === "CONFLICT") throw new AppError("CONFLICT", "There is already a pending correction for this ballot.");
    throw m ?? e;
  }
}

export async function reviewCorrection(id: string, approve: boolean, note: string, adminId: string, ipHash: string | null) {
  try {
    const row = await one<{ status: string }>(`select review_correction($1, $2, $3, $4, $5) as status`, [id, adminId, approve, note, ipHash]);
    return row!.status;
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

export async function cancelCorrection(id: string, adminId: string, ipHash: string | null) {
  await tx(async (c) => {
    const r = await one<{ requested_by: string; status: string }>(`select requested_by, status from correction_requests where id = $1 for update`, [id], c);
    if (!r) throw new AppError("NOT_FOUND");
    if (r.requested_by !== adminId) throw new AppError("FORBIDDEN", "Only the requester can withdraw a correction request.");
    if (r.status !== "PENDING") throw new AppError("INVALID_STATE");
    await query(`update correction_requests set status = 'CANCELLED' where id = $1`, [id], c);
    await audit({ actorType: "ADMIN", adminId, action: "CORRECTION.CANCELLED", entityType: "correction_request", entityId: id, ipHash }, c);
  });
}
