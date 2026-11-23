import "server-only";
import { z } from "zod";
import { query, one } from "../db";
import { AppError, fromDbError } from "../errors";
import { voterTokenHash } from "./voter-auth";
import { enforceRateLimit } from "../rate-limit";
import { photoUrl } from "../storage";

export type PositionGender = "MALE" | "FEMALE" | null;
export type Position = { id: string; code: string; title: string; gender: PositionGender; display_order: number };

export type BallotCandidate = {
  id: string;
  position_id: string;
  display_name: string;
  roll_number: string;
  introduction: string;
  manifesto: string;
  photo_path: string | null;
  photo_url: string | null;
  display_order: number;
};

/** Races of an election in display order (Boys' CR first, then Girls' CR). */
export async function listPositions(electionId: string): Promise<Position[]> {
  return query<Position>(
    // to_jsonb(p)->>'gender' tolerates a database that has not yet had the two-race upgrade (returns null instead of erroring).
    `select p.id, p.code, p.title, to_jsonb(p)->>'gender' as gender, p.display_order from election_positions p where p.election_id = $1 order by p.display_order, p.code`,
    [electionId],
  );
}

export async function listApprovedCandidates(electionId: string): Promise<BallotCandidate[]> {
  const rows = await query<Omit<BallotCandidate, "photo_url">>(
    `select c.id, c.position_id, c.display_name, s.roll_number, c.introduction, c.manifesto, c.photo_path, c.display_order
       from candidates c join students s on s.id = c.student_id join election_positions p on p.id = c.position_id
      where c.election_id = $1 and c.status = 'APPROVED'
      order by p.display_order, c.display_order, c.display_name`,
    [electionId],
  );
  return rows.map((r) => ({ ...r, photo_url: photoUrl(r.photo_path) }));
}

export async function getPublicCandidate(id: string) {
  const row = await one<Omit<BallotCandidate, "photo_url"> & { election_id: string; election_title: string; position_gender: PositionGender }>(
    `select c.id, c.position_id, c.display_name, s.roll_number, c.introduction, c.manifesto, c.photo_path, c.display_order,
            c.election_id, e.title as election_title, to_jsonb(p)->>'gender' as position_gender
       from candidates c join students s on s.id = c.student_id join elections e on e.id = c.election_id
       join election_positions p on p.id = c.position_id
      where c.id = $1 and c.status = 'APPROVED' and e.status <> 'DRAFT'`,
    [id],
  );
  return row ? { ...row, photo_url: photoUrl(row.photo_path) } : null;
}

/** One candidate id per position (Boys' CR + Girls' CR). The database enforces the exact shape. */
export const castSchema = z.object({ candidateIds: z.array(z.string().uuid()).min(1).max(8) });

/**
 * Submits the ballot through cast_ballot(): authentication, election status,
 * eligibility, "exactly one candidate in every position", candidate validity,
 * participation and the anonymous ballot rows are all handled in ONE database
 * transaction with row locks and a unique constraint.
 */
export async function castVote(token: string | undefined | null, candidateIds: string[]) {
  if (!token) throw new AppError("SESSION_INVALID");
  try {
    const row = await one<{ receipt_code: string; voted_at: Date }>(
      "select receipt_code, voted_at from cast_ballot($1, $2::uuid[])",
      [voterTokenHash(token), candidateIds],
    );
    if (!row) throw new AppError("INTERNAL");
    return { receiptCode: row.receipt_code, votedAt: row.voted_at };
  } catch (err) {
    throw fromDbError(err) ?? err;
  }
}

export async function verifyReceipt(code: string, ip: string | null) {
  await enforceRateLimit("receipt-ip", ip ?? "unknown", 30, 15 * 60);
  const normalized = code.trim().toUpperCase();
  if (!/^TT28-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalized)) return null;
  return one<{ election_title: string; voted_at: Date }>(
    `select e.title as election_title, p.voted_at from voter_participation p join elections e on e.id = p.election_id
      where p.receipt_code = $1`,
    [normalized],
  );
}
