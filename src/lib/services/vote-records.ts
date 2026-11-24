import "server-only";
import { z } from "zod";
import { one, query } from "../db";
import { AppError, fromDbError } from "../errors";

/**
 * Open ballot (see /terms): from the day the notice went live, each vote is also stored with the voter
 * (table voter_choices, append-only). Only a Super Admin can read it, through SECURITY DEFINER database
 * functions that re-check the live session, the role and a fresh authenticator code, and write the audit log.
 *
 * Nobody can edit a vote. A vote change is a REPLACE_CHOICE correction request: one Super Admin requests it
 * with a reason after voting closes, a DIFFERENT Super Admin approves or rejects it, and on approval the
 * original ballot is kept (marked invalidated) and a linked replacement ballot is added.
 * Votes cast before the notice are anonymous and never appear with a candidate.
 */
export type VoteRow = {
  student_id: string; roll_number: string; full_name: string; voted_at: Date; receipt_code: string;
  position_id: string | null; position_code: string | null; position_gender: string | null; position_order: number | null;
  original_candidate_id: string | null; original_candidate_name: string | null; original_ballot_ref: string | null;
  current_candidate_id: string | null; current_candidate_name: string | null; current_ballot_ref: string | null; current_status: string | null;
  approved_corrections: number; legacy_changed_at: Date | null; legacy_change_reason: string | null;
  pending_request_id: string | null; pending_correction: string | null; pending_candidate_name: string | null; pending_requested_by: string | null;
};

export type VoteChoice = {
  positionId: string; positionCode: string; gender: string | null;
  originalCandidateId: string; originalName: string; originalRef: string;
  candidateId: string; candidateName: string; ballotRef: string; status: "VALID" | "INVALIDATED";
  corrections: number; legacyChangedAt: Date | null; legacyReason: string | null;
  pending: { id: string; correction: string; candidateName: string | null; requestedBy: string } | null;
};

export type VoterVotes = {
  studentId: string; roll: string; name: string; votedAt: Date; receipt: string;
  anonymous: boolean; // cast before the open-ballot notice
  choices: VoteChoice[];
};

export async function listVoteRecords(sessionTokenHash: string, electionId: string, ipHash: string | null): Promise<VoterVotes[]> {
  let rows: VoteRow[];
  try {
    rows = await query<VoteRow>(`select * from admin_vote_records($1, $2, $3)`, [sessionTokenHash, electionId, ipHash]);
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
  const byStudent = new Map<string, VoterVotes>();
  for (const r of rows) {
    let v = byStudent.get(r.student_id);
    if (!v) {
      v = { studentId: r.student_id, roll: r.roll_number, name: r.full_name, votedAt: r.voted_at, receipt: r.receipt_code, anonymous: !r.position_id, choices: [] };
      byStudent.set(r.student_id, v);
    }
    if (r.position_id && r.current_candidate_id) {
      v.choices.push({
        positionId: r.position_id, positionCode: r.position_code ?? "", gender: r.position_gender,
        originalCandidateId: r.original_candidate_id ?? "", originalName: r.original_candidate_name ?? "", originalRef: r.original_ballot_ref ?? "",
        candidateId: r.current_candidate_id, candidateName: r.current_candidate_name ?? "", ballotRef: r.current_ballot_ref ?? "",
        status: r.current_status === "INVALIDATED" ? "INVALIDATED" : "VALID",
        corrections: r.approved_corrections, legacyChangedAt: r.legacy_changed_at, legacyReason: r.legacy_change_reason,
        pending: r.pending_request_id ? { id: r.pending_request_id, correction: r.pending_correction ?? "", candidateName: r.pending_candidate_name, requestedBy: r.pending_requested_by ?? "" } : null,
      });
    }
  }
  return [...byStudent.values()];
}

export const choiceChangeSchema = z.object({
  electionId: z.string().uuid(),
  studentId: z.string().uuid(),
  positionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  reason: z.string().trim().min(20, "অন্তত ২০ অক্ষরে কারণ ব্যাখ্যা করুন।").max(2000),
  evidenceNote: z.string().trim().max(2000).optional().default(""),
});

/** Opens a REPLACE_CHOICE correction request. Nothing changes until a second Super Admin approves it. */
export async function requestChoiceChange(sessionTokenHash: string, input: z.input<typeof choiceChangeSchema>, ipHash: string | null) {
  const v = choiceChangeSchema.parse(input);
  try {
    const r = await one<{ id: string }>(`select request_choice_change($1, $2, $3, $4, $5, $6, $7, $8) as id`,
      [sessionTokenHash, v.electionId, v.studentId, v.positionId, v.candidateId, v.reason, v.evidenceNote, ipHash]);
    return r!.id;
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

export const voterRequestSchema = z.object({
  electionId: z.string().uuid(),
  studentId: z.string().uuid(),
  positionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  channel: z.string().trim().min(2, "ভোটার কীভাবে অনুরোধ করেছেন তা লিখুন।").max(200),
  reason: z.string().trim().min(20, "অন্তত ২০ অক্ষরে কারণ ব্যাখ্যা করুন।").max(2000),
});

/**
 * The voter asked (e.g. on Facebook) to change their vote: one Super Admin records it at once, while voting is
 * live or paused or after it closes. The original ballot is kept (invalidated) and a linked replacement is added;
 * the database re-checks the Super Admin session and a fresh authenticator code, and writes the audit log.
 */
export async function changeVoteOnRequest(sessionTokenHash: string, input: z.input<typeof voterRequestSchema>, ipHash: string | null) {
  const v = voterRequestSchema.parse(input);
  try {
    const r = await one<{ id: string }>(`select change_vote_on_voter_request($1, $2, $3, $4, $5, $6, $7, $8) as id`,
      [sessionTokenHash, v.electionId, v.studentId, v.positionId, v.candidateId, v.channel, v.reason, ipHash]);
    return r!.id;
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

export const cancelVoteSchema = z.object({
  electionId: z.string().uuid(),
  studentId: z.string().uuid(),
  channel: z.string().trim().min(2, "কীভাবে/কার অনুরোধে বাতিল করা হচ্ছে তা লিখুন।").max(200),
  reason: z.string().trim().min(20, "অন্তত ২০ অক্ষরে কারণ ব্যাখ্যা করুন।").max(2000),
});

/**
 * Cancels all of a voter's current ballots (e.g. a vote cast by mistake): one Super Admin, while voting is live
 * or paused or after it closes. Ballots are kept and marked invalidated; the voter stays "voted" and cannot vote
 * again. The database re-checks the Super Admin session and a fresh authenticator code, and writes the audit log.
 */
export async function cancelVote(sessionTokenHash: string, input: z.input<typeof cancelVoteSchema>, ipHash: string | null) {
  const v = cancelVoteSchema.parse(input);
  try {
    const r = await one<{ n: number }>(`select cancel_vote_on_request($1, $2, $3, $4, $5, $6) as n`,
      [sessionTokenHash, v.electionId, v.studentId, v.channel, v.reason, ipHash]);
    return r!.n;
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

/** When this voter's vote was last corrected (null if never). Safe before the upgrade is applied. */
export async function voteChangedAt(studentId: string, electionId: string): Promise<Date | null> {
  try {
    const r = await one<{ t: Date | null }>(`select voter_choice_changed_at($1, $2) as t`, [studentId, electionId]);
    return r?.t ?? null;
  } catch {
    return null;
  }
}

export { AppError };
