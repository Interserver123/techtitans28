import "server-only";
import { z } from "zod";
import { query, one, tx } from "../db";
import { AppError, fromDbError } from "../errors";
import { audit } from "../audit";
import { putObject, validateEvidence } from "../storage";

export const correctionSchema = z.object({
  ballotRef: z.string().trim().toUpperCase().regex(/^B-[A-F0-9]{16}$/, "সঠিক ব্যালট রেফারেন্স লিখুন (B-…)।"),
  correction: z.enum(["INVALIDATE_BALLOT", "REINSTATE_BALLOT"]),
  reason: z.string().trim().min(20, "অন্তত ২০ অক্ষরে কারণ ব্যাখ্যা করুন।").max(2000),
  evidenceNote: z.string().trim().max(2000).optional().default(""),
});

export type CorrectionRow = {
  id: string;
  election_id: string;
  ballot_ref: string;
  ballot_status: string;
  correction: "INVALIDATE_BALLOT" | "REINSTATE_BALLOT" | "REPLACE_CHOICE";
  reason: string;
  /** REPLACE_CHOICE: the candidate on the ballot now, and the one requested. */
  from_candidate: string | null;
  to_candidate: string | null;
  /** REPLACE_CHOICE, once approved: the new ballot that replaced this one. */
  replacement_ref: string | null;
  replaced: boolean;
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
  try {
    return await query<CorrectionRow>(
      `with ledger as (select * from ballot_ledger($1))
       select r.id, r.election_id, b.ballot_ref, b.status as ballot_status, r.correction, r.reason, r.evidence_note, r.evidence_path,
              r.status, r.requested_by, ra.full_name as requester_name, r.requested_at, r.reviewed_by, rv.full_name as reviewer_name,
              r.reviewed_at, r.review_note, r.ballot_status_before,
              case when r.correction::text = 'REPLACE_CHOICE' then b.candidate_name end as from_candidate,
              nc.display_name as to_candidate, rb.ballot_ref as replacement_ref,
              exists (select 1 from ledger x where x.replaces_ballot_ref = b.ballot_ref) as replaced
         from correction_requests r
         join election_admins ra on ra.id = r.requested_by
         left join election_admins rv on rv.id = r.reviewed_by
         join ledger b on b.ballot_id = r.ballot_id
         left join candidates nc on nc.id = r.new_candidate_id
         left join ledger rb on rb.created_by_correction_id = r.id
        where r.election_id = $1
        order by r.requested_at desc`,
      [electionId],
    );
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

/** Which voter each correction concerns (via the open-ballot link). Super Admin session only; null if unavailable. */
export async function correctionSubjects(sessionTokenHash: string, electionId: string) {
  try {
    const rows = await query<{ correction_id: string; roll_number: string; full_name: string }>(
      `select * from admin_correction_subjects($1, $2)`, [sessionTokenHash, electionId]);
    return new Map(rows.map((r) => [r.correction_id, { roll: r.roll_number, name: r.full_name }]));
  } catch {
    return null;
  }
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
  if (el.status !== "CLOSED") throw new AppError("INVALID_STATE", "শুধু নির্বাচন শেষ হওয়ার পর এবং ফলাফল প্রকাশের আগে সংশোধনের অনুরোধ করা যায়।");
  const ballot = await one<{ ballot_id: string; status: string; replaced: boolean }>(
    `select l.ballot_id, l.status, exists (select 1 from ballot_ledger($1) x where x.replaces_ballot_ref = l.ballot_ref) as replaced
       from ballot_ledger($1) l where l.ballot_ref = $2`, [electionId, v.ballotRef]).catch((e) => { throw fromDbError(e) ?? e; });
  if (!ballot) throw new AppError("NOT_FOUND", "এই নির্বাচনে এই রেফারেন্সের কোনো ব্যালট নেই।");
  if (ballot.replaced) throw new AppError("INVALID_STATE", "এই ব্যালটের জায়গায় সংশোধনের মাধ্যমে নতুন ব্যালট এসেছে; নতুন (প্রতিস্থাপিত) ব্যালটটি সংশোধন করুন।");
  if (v.correction === "INVALIDATE_BALLOT" && ballot.status !== "VALID") throw new AppError("INVALID_STATE", "এই ব্যালট ইতিমধ্যে বাতিল।");
  if (v.correction === "REINSTATE_BALLOT" && ballot.status !== "INVALIDATED") throw new AppError("INVALID_STATE", "শুধু বাতিল ব্যালটই পুনর্বহাল করা যায়।");
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
    if (m?.code === "CONFLICT") throw new AppError("CONFLICT", "এই ব্যালটের জন্য ইতিমধ্যে একটি সংশোধন অপেক্ষমাণ।");
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
    if (r.requested_by !== adminId) throw new AppError("FORBIDDEN", "শুধু অনুরোধকারীই সংশোধনের অনুরোধ প্রত্যাহার করতে পারেন।");
    if (r.status !== "PENDING") throw new AppError("INVALID_STATE");
    await query(`update correction_requests set status = 'CANCELLED' where id = $1`, [id], c);
    await audit({ actorType: "ADMIN", adminId, action: "CORRECTION.CANCELLED", entityType: "correction_request", entityId: id, ipHash }, c);
  });
}
