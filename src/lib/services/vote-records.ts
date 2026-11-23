import "server-only";
import { z } from "zod";
import { one, query } from "../db";
import { AppError, fromDbError } from "../errors";

/**
 * Open ballot (see /terms): from the day the notice went live, each vote is also stored with the voter
 * (table voter_choices). Only a Super Admin can read or change it, through SECURITY DEFINER database
 * functions that re-check the role and write the audit log. Votes cast before that are anonymous and
 * never appear with a candidate.
 */
export type VoteRow = {
  student_id: string; roll_number: string; full_name: string; voted_at: Date; receipt_code: string;
  position_id: string | null; position_code: string | null; position_gender: string | null; position_order: number | null;
  candidate_id: string | null; candidate_name: string | null; ballot_ref: string | null;
  changed_at: Date | null; change_reason: string | null; original_candidate_name: string | null;
};

export type VoterVotes = {
  studentId: string; roll: string; name: string; votedAt: Date; receipt: string;
  anonymous: boolean; // cast before the open-ballot notice
  choices: { positionId: string; positionCode: string; gender: string | null; candidateId: string; candidateName: string; changedAt: Date | null; reason: string | null; originalName: string | null }[];
};

export async function listVoteRecords(adminId: string, electionId: string, ipHash: string | null): Promise<VoterVotes[]> {
  let rows: VoteRow[];
  try {
    rows = await query<VoteRow>(`select * from admin_list_votes($1, $2, $3)`, [adminId, electionId, ipHash]);
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
    if (r.position_id && r.candidate_id) {
      v.choices.push({ positionId: r.position_id, positionCode: r.position_code ?? "", gender: r.position_gender, candidateId: r.candidate_id, candidateName: r.candidate_name ?? "", changedAt: r.changed_at, reason: r.change_reason, originalName: r.original_candidate_name });
    }
  }
  return [...byStudent.values()];
}

export const changeVoteSchema = z.object({
  electionId: z.string().uuid(),
  studentId: z.string().uuid(),
  positionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  reason: z.string().trim().min(5, "পরিবর্তনের কারণ অন্তত ৫ অক্ষরে লিখুন।").max(500),
});

export async function changeVote(adminId: string, input: z.infer<typeof changeVoteSchema>, ipHash: string | null) {
  const v = changeVoteSchema.parse(input);
  try {
    await query(`select admin_change_vote($1, $2, $3, $4, $5, $6, $7)`, [adminId, v.electionId, v.studentId, v.positionId, v.candidateId, v.reason, ipHash]);
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

/** When the Super Admin changed this voter's vote (null if never). Safe before the upgrade is applied. */
export async function voteChangedAt(studentId: string, electionId: string): Promise<Date | null> {
  try {
    const r = await one<{ t: Date | null }>(`select voter_choice_changed_at($1, $2) as t`, [studentId, electionId]);
    return r?.t ?? null;
  } catch {
    return null;
  }
}

export { AppError };
