import "server-only";
import { query, one } from "../db";
import { AppError, fromDbError } from "../errors";
import { getElection, getTurnout, type Election } from "./elections";
import { photoUrl } from "../storage";

export type TallyRow = {
  candidate_id: string; display_name: string; roll_number: string; votes: number; rank: number; photo_url?: string | null;
  position_id: string; position_code: string; position_title: string; position_gender: "MALE" | "FEMALE" | null; position_order: number;
};
export type Outcome = { kind: "WINNER"; winner: TallyRow } | { kind: "TIE"; tied: TallyRow[] } | { kind: "NO_VOTES" };
export type PositionResult = {
  position: { id: string; code: string; title: string; gender: "MALE" | "FEMALE" | null; order: number };
  tally: TallyRow[];
  totals: { total_ballots: number; valid_ballots: number; invalidated_ballots: number };
  outcome: Outcome;
};

export type ResultSummary = {
  election: Election;
  positions: PositionResult[];
  /** Election-wide: ballot rows are one per voter per position. */
  /** total_ballots = ballots voters cast; replacement_ballots = added by approved vote corrections (absent before upgrade 0009). */
  totals: { total_ballots: number; valid_ballots: number; invalidated_ballots: number; participation: number; positions: number; replacement_ballots?: number };
  turnout: { eligible: number; voted: number; turnoutPct: number };
  reconciled: boolean;
  appliedCorrections: number;
  pendingCorrections: number;
  currentHash: string;
  verificationMatches: boolean;
  official: boolean;
};

export function outcomeOf(tally: Pick<TallyRow, "votes" | "candidate_id" | "display_name" | "roll_number" | "rank">[]): Outcome {
  const top = tally[0]?.votes ?? 0;
  if (!tally.length || top === 0) return { kind: "NO_VOTES" };
  const tied = tally.filter((t) => t.votes === top) as TallyRow[];
  return tied.length > 1 ? { kind: "TIE", tied } : { kind: "WINNER", winner: tied[0] };
}

export async function getBallotTotals(electionId: string) {
  return (await one<ResultSummary["totals"]>(`select * from ballot_totals($1)`, [electionId]))!;
}

type PosTotals = { position_id: string; code: string; title: string; gender: "MALE" | "FEMALE" | null; display_order: number; total_ballots: number; valid_ballots: number; invalidated_ballots: number };

function groupByPosition(tally: TallyRow[], pos: PosTotals[]): PositionResult[] {
  return pos.map((p) => {
    const rows = tally.filter((t) => t.position_id === p.position_id).sort((a, b) => b.votes - a.votes);
    return {
      position: { id: p.position_id, code: p.code, title: p.title, gender: p.gender, order: p.display_order },
      tally: rows,
      totals: { total_ballots: p.total_ballots, valid_ballots: p.valid_ballots, invalidated_ballots: p.invalidated_ballots },
      outcome: outcomeOf(rows),
    };
  });
}

/**
 * Candidate-wise results for administrators. compute_tally() itself refuses to
 * run before closure, so this cannot leak results during voting.
 */
export async function getResultSummary(electionId: string): Promise<ResultSummary> {
  const election = await getElection(electionId);
  if (!["CLOSED", "RESULTS_PUBLISHED"].includes(election.status)) throw new AppError("RESULTS_SEALED");
  try {
    const tally = await query<TallyRow>(`select * from compute_tally($1)`, [electionId]);
    const photos = await query<{ id: string; photo_path: string | null }>(`select id, photo_path from candidates where election_id = $1`, [electionId]);
    const photoMap = new Map(photos.map((p) => [p.id, photoUrl(p.photo_path)]));
    const totals = await getBallotTotals(electionId);
    const byPos = await query<PosTotals>(`select * from ballot_totals_by_position($1)`, [electionId]);
    const corr = await one<{ applied: number; pending: number }>(
      `select count(*) filter (where status = 'APPROVED')::int as applied, count(*) filter (where status = 'PENDING')::int as pending
         from correction_requests where election_id = $1`,
      [electionId],
    );
    const hash = await one<{ h: string }>(`select tally_hash($1) as h`, [electionId]);
    const withPhotos = tally.map((t) => ({ ...t, photo_url: photoMap.get(t.candidate_id) ?? null }));
    const positions = groupByPosition(withPhotos, byPos);
    return {
      election,
      positions,
      totals,
      turnout: await getTurnout(election),
      // Every position must hold exactly one ballot per voter, and each tally must add up to its valid ballots.
      reconciled:
        byPos.length > 0 &&
        byPos.every((p) => p.total_ballots === totals.participation) &&
        positions.every((p) => p.tally.reduce((a, t) => a + t.votes, 0) === p.totals.valid_ballots),
      appliedCorrections: corr?.applied ?? 0,
      pendingCorrections: corr?.pending ?? 0,
      currentHash: hash!.h,
      verificationMatches: election.results_verified_hash === hash!.h,
      official: election.status === "RESULTS_PUBLISHED",
    };
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

/** Official results for the public: only from the immutable snapshot, only once published. */
export async function getPublishedResults(election: Election) {
  if (election.status !== "RESULTS_PUBLISHED") return null;
  const rows = await query<TallyRow & { is_winner: boolean; is_tied: boolean; photo_path: string | null }>(
    `select r.candidate_id, c.display_name, s.roll_number, r.vote_count as votes, r.rank, r.is_winner, r.is_tied, c.photo_path,
            p.id as position_id, p.code as position_code, p.title as position_title, p.gender as position_gender, p.display_order as position_order
       from election_results r join candidates c on c.id = r.candidate_id join students s on s.id = c.student_id
       join election_positions p on p.id = c.position_id
      where r.election_id = $1 order by p.display_order, r.rank, c.display_order, c.display_name`,
    [election.id],
  );
  const totals = await getBallotTotals(election.id);
  const byPos = await query<PosTotals>(`select * from ballot_totals_by_position($1)`, [election.id]);
  const withPhotos = rows.map((r) => ({ ...r, photo_url: photoUrl(r.photo_path) }));
  return {
    positions: groupByPosition(withPhotos, byPos),
    totals,
    turnout: await getTurnout(election),
    publishedAt: election.results_published_at,
    note: election.result_note,
  };
}

export async function verifyResults(electionId: string, adminId: string, ipHash: string | null) {
  try {
    return (await one<{ h: string }>(`select verify_results($1, $2, $3) as h`, [electionId, adminId, ipHash]))!.h;
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

export async function publishResults(electionId: string, adminId: string, note: string, ipHash: string | null) {
  try {
    return await query(`select * from publish_results($1, $2, $3, $4)`, [electionId, adminId, note || null, ipHash]);
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

export async function getBallotLedger(electionId: string) {
  try {
    return await query<{ ballot_id: string; ballot_ref: string; candidate_name: string; status: string; last_correction_id: string | null; position_id: string; position_title: string; position_gender: "MALE" | "FEMALE" | null; replaces_ballot_ref?: string | null; created_by_correction_id?: string | null }>(
      `select * from ballot_ledger($1)`,
      [electionId],
    );
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}
