import "server-only";
import { query, one } from "../db";
import { AppError, fromDbError } from "../errors";
import { getElection, getTurnout, type Election } from "./elections";
import { photoUrl } from "../storage";

export type TallyRow = { candidate_id: string; display_name: string; roll_number: string; votes: number; rank: number; photo_url?: string | null };

export type ResultSummary = {
  election: Election;
  tally: TallyRow[];
  totals: { total_ballots: number; valid_ballots: number; invalidated_ballots: number; participation: number };
  turnout: { eligible: number; voted: number; turnoutPct: number };
  outcome: { kind: "WINNER"; winner: TallyRow } | { kind: "TIE"; tied: TallyRow[] } | { kind: "NO_VOTES" };
  reconciled: boolean;
  appliedCorrections: number;
  pendingCorrections: number;
  currentHash: string;
  verificationMatches: boolean;
  official: boolean;
};

function outcomeOf(tally: TallyRow[]): ResultSummary["outcome"] {
  const top = tally[0]?.votes ?? 0;
  if (!tally.length || top === 0) return { kind: "NO_VOTES" };
  const tied = tally.filter((t) => t.votes === top);
  return tied.length > 1 ? { kind: "TIE", tied } : { kind: "WINNER", winner: tied[0] };
}

export async function getBallotTotals(electionId: string) {
  return (await one<ResultSummary["totals"]>(`select * from ballot_totals($1)`, [electionId]))!;
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
    const corr = await one<{ applied: number; pending: number }>(
      `select count(*) filter (where status = 'APPROVED')::int as applied, count(*) filter (where status = 'PENDING')::int as pending
         from correction_requests where election_id = $1`,
      [electionId],
    );
    const hash = await one<{ h: string }>(`select tally_hash($1) as h`, [electionId]);
    return {
      election,
      tally: tally.map((t) => ({ ...t, photo_url: photoMap.get(t.candidate_id) ?? null })),
      totals,
      turnout: await getTurnout(election),
      outcome: outcomeOf(tally),
      reconciled: totals.total_ballots === totals.participation && tally.reduce((a, t) => a + t.votes, 0) === totals.valid_ballots,
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
    `select r.candidate_id, c.display_name, s.roll_number, r.vote_count as votes, r.rank, r.is_winner, r.is_tied, c.photo_path
       from election_results r join candidates c on c.id = r.candidate_id join students s on s.id = c.student_id
      where r.election_id = $1 order by r.rank, c.display_order, c.display_name`,
    [election.id],
  );
  const totals = await getBallotTotals(election.id);
  return {
    rows: rows.map((r) => ({ ...r, photo_url: photoUrl(r.photo_path) })),
    totals,
    turnout: await getTurnout(election),
    outcome: outcomeOf(rows),
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
    return await query<{ ballot_id: string; ballot_ref: string; candidate_name: string; status: string; last_correction_id: string | null }>(
      `select * from ballot_ledger($1)`,
      [electionId],
    );
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}
