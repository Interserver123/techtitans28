import "server-only";
import { z } from "zod";
import { query, one, tx } from "../db";
import { audit } from "../audit";
import { AppError, fromDbError } from "../errors";
import { STATUS_LABEL } from "../format";

export type ElectionStatus = "DRAFT" | "SCHEDULED" | "LIVE" | "PAUSED" | "CLOSED" | "RESULTS_PUBLISHED";

export type Election = {
  id: string;
  title: string;
  description: string;
  status: ElectionStatus;
  opens_at: Date;
  closes_at: Date;
  opened_at: Date | null;
  closed_at: Date | null;
  eligible_snapshot: number | null;
  results_verified_at: Date | null;
  results_verified_by: string | null;
  results_verified_hash: string | null;
  results_published_at: Date | null;
  results_published_by: string | null;
  result_note: string | null;
  created_at: Date;
};

const ELECTION_COLS = `id, title, description, status, opens_at, closes_at, opened_at, closed_at, eligible_snapshot,
  results_verified_at, results_verified_by, results_verified_hash, results_published_at, results_published_by, result_note, created_at`;

/** Applies time-driven transitions (auto-open / auto-close). Safe to call on every request. */
export async function refreshStatus() {
  await query("select refresh_election_status()");
}

/**
 * The election shown publicly and used by the voter portal:
 * the active one (scheduled/live/paused) or, failing that, the most recent closed/published one.
 */
export async function getCurrentElection(): Promise<Election | null> {
  await refreshStatus();
  return one<Election>(
    `select ${ELECTION_COLS} from elections
      where status <> 'DRAFT'
      order by (status in ('SCHEDULED','LIVE','PAUSED')) desc, opens_at desc
      limit 1`,
  );
}

export async function getElection(id: string): Promise<Election> {
  await refreshStatus();
  const e = await one<Election>(`select ${ELECTION_COLS} from elections where id = $1`, [id]);
  if (!e) throw new AppError("NOT_FOUND");
  return e;
}

export async function listElections(): Promise<Election[]> {
  await refreshStatus();
  return query<Election>(`select ${ELECTION_COLS} from elections order by created_at desc`);
}

/** Whether a ballot can be accepted right now (mirrors cast_ballot()). */
export function isVotingOpen(e: Pick<Election, "status" | "opens_at" | "closes_at">, now = new Date()) {
  if (now >= new Date(e.closes_at)) return false;
  return e.status === "LIVE" || (e.status === "SCHEDULED" && now >= new Date(e.opens_at));
}

export type Turnout = { eligible: number; voted: number; turnoutPct: number };

export async function getTurnout(e: Pick<Election, "id" | "eligible_snapshot" | "status">): Promise<Turnout> {
  const row = await one<{ eligible: number; voted: number }>(
    `select eligible_voter_count() as eligible,
            (select count(*)::int from voter_participation where election_id = $1) as voted`,
    [e.id],
  );
  const eligible = ["CLOSED", "RESULTS_PUBLISHED"].includes(e.status) && e.eligible_snapshot != null ? e.eligible_snapshot : (row?.eligible ?? 0);
  const voted = row?.voted ?? 0;
  const denominator = Math.max(eligible, voted);
  return { eligible, voted, turnoutPct: denominator === 0 ? 0 : Math.round((voted / denominator) * 1000) / 10 };
}

/** Hourly participation buckets (aggregate only — no ballot information). */
export async function participationTimeline(electionId: string) {
  return query<{ bucket: Date; votes: number; cumulative: number }>(
    `select bucket, votes, sum(votes) over (order by bucket)::int as cumulative from (
       select date_trunc('hour', voted_at) as bucket, count(*)::int as votes
         from voter_participation where election_id = $1 group by 1) t order by bucket`,
    [electionId],
  );
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------
export const electionInputSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(4000).default(""),
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
  })
  .refine((v) => v.closesAt > v.opensAt, { message: "শেষের সময় অবশ্যই শুরুর সময়ের পরে হতে হবে", path: ["closesAt"] });

export async function createElection(input: z.input<typeof electionInputSchema>, adminId: string, ipHash: string | null) {
  const v = electionInputSchema.parse(input);
  return tx(async (c) => {
    const e = await one<{ id: string }>(
      `insert into elections (title, description, opens_at, closes_at, created_by) values ($1, $2, $3, $4, $5) returning id`,
      [v.title, v.description, v.opensAt, v.closesAt, adminId],
      c,
    );
    // Two races, one vote in each: Boys' CR (male candidates) and Girls' CR (female candidates).
    await query(
      `insert into election_positions (election_id, code, title, gender, display_order) values
         ($1, 'CR_BOYS', 'Boys'' Class Representative', 'MALE', 1),
         ($1, 'CR_GIRLS', 'Girls'' Class Representative', 'FEMALE', 2)`,
      [e!.id],
      c,
    );
    await audit({ actorType: "ADMIN", adminId, action: "ELECTION.CREATED", entityType: "election", entityId: e!.id, details: { title: v.title, opens_at: v.opensAt, closes_at: v.closesAt }, ipHash }, c);
    return e!.id;
  });
}

export async function updateElection(id: string, input: z.input<typeof electionInputSchema>, adminId: string, ipHash: string | null, role?: string) {
  const v = electionInputSchema.parse(input);
  try {
    await tx(async (c) => {
      const before = await one<Election>(`select ${ELECTION_COLS} from elections where id = $1 for update`, [id], c);
      if (!before) throw new AppError("NOT_FOUND");
      const timesChanged = new Date(before.opens_at).getTime() !== v.opensAt.getTime() || new Date(before.closes_at).getTime() !== v.closesAt.getTime();
      if (role === "SUPER_ADMIN" && timesChanged && ["SCHEDULED", "LIVE", "PAUSED"].includes(before.status)) {
        // Super Admin: both times may change at any time before closing (checked again inside the database function).
        await query(`update elections set title = $2, description = $3 where id = $1`, [id, v.title, v.description], c);
        await query(`select admin_set_election_window($1, $2, $3, $4, $5)`, [id, adminId, v.opensAt, v.closesAt, ipHash], c);
        return;
      }
      await query(`update elections set title = $2, description = $3, opens_at = $4, closes_at = $5 where id = $1`, [id, v.title, v.description, v.opensAt, v.closesAt], c);
      await audit({
        actorType: "ADMIN", adminId, action: "ELECTION.UPDATED", entityType: "election", entityId: id,
        details: { before: { title: before.title, opens_at: before.opens_at, closes_at: before.closes_at }, after: { title: v.title, opens_at: v.opensAt, closes_at: v.closesAt } },
        ipHash,
      }, c);
    });
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

export async function deleteDraftElection(id: string, adminId: string, ipHash: string | null) {
  try {
    await tx(async (c) => {
      const e = await one<{ status: string; title: string }>("select status, title from elections where id = $1 for update", [id], c);
      if (!e) throw new AppError("NOT_FOUND");
      if (e.status !== "DRAFT") throw new AppError("INVALID_STATE", "শুধু খসড়া নির্বাচনই মুছে ফেলা যায়।");
      await query("delete from candidates where election_id = $1", [id], c);
      await query("delete from election_positions where election_id = $1", [id], c);
      await query("delete from elections where id = $1", [id], c);
      await audit({ actorType: "ADMIN", adminId, action: "ELECTION.DELETED", entityType: "election", entityId: id, details: { title: e.title }, ipHash }, c);
    });
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

export type ElectionAction = "schedule" | "unschedule" | "open" | "pause" | "resume" | "close";

const ACTION_TARGET: Record<ElectionAction, { from: ElectionStatus[]; to: ElectionStatus }> = {
  schedule: { from: ["DRAFT"], to: "SCHEDULED" },
  unschedule: { from: ["SCHEDULED"], to: "DRAFT" },
  open: { from: ["SCHEDULED"], to: "LIVE" },
  pause: { from: ["LIVE"], to: "PAUSED" },
  resume: { from: ["PAUSED"], to: "LIVE" },
  close: { from: ["LIVE", "PAUSED", "SCHEDULED"], to: "CLOSED" },
};

export async function transitionElection(id: string, action: ElectionAction, adminId: string, ipHash: string | null, reason?: string) {
  const t = ACTION_TARGET[action];
  if (!t) throw new AppError("BAD_REQUEST");
  await refreshStatus();
  try {
    return await tx(async (c) => {
      const e = await one<Election>(`select ${ELECTION_COLS} from elections where id = $1 for update`, [id], c);
      if (!e) throw new AppError("NOT_FOUND");
      if (!t.from.includes(e.status)) {
        throw new AppError("INVALID_TRANSITION", `“${STATUS_LABEL[e.status] ?? e.status}” অবস্থার নির্বাচনে এই কাজটি করা যায় না।`);
      }
      if (action === "schedule") {
        const empty = await query<{ code: string }>(
          `select p.code from election_positions p
            where p.election_id = $1 and not exists (select 1 from candidates c where c.position_id = p.id and c.status = 'APPROVED')`,
          [id],
          c,
        );
        if (empty.length) {
          const names = empty.map((r) => (r.code === "CR_GIRLS" ? "ছাত্রী সিআর" : r.code === "CR_BOYS" ? "ছাত্র সিআর" : r.code)).join(", ");
          throw new AppError("INVALID_STATE", `সময়সূচি নির্ধারণের আগে প্রতিটি পদে অন্তত একজন প্রার্থীকে অনুমোদন দিন (প্রার্থী নেই: ${names})।`);
        }
        if (new Date(e.closes_at) <= new Date()) throw new AppError("INVALID_STATE", "শেষের সময় ইতিমধ্যে পেরিয়ে গেছে।");
      }
      if ((action === "pause" || action === "close") && (!reason || reason.trim().length < 5)) {
        throw new AppError("VALIDATION", "A reason (at least 5 characters) is required.");
      }
      const extra = action === "close" ? ", eligible_snapshot = eligible_voter_count()" : "";
      await query(`update elections set status = $2${extra} where id = $1`, [id, t.to], c);
      await audit({
        actorType: "ADMIN", adminId, action: `ELECTION.${action.toUpperCase()}`, entityType: "election", entityId: id,
        details: { from: e.status, to: t.to, reason: reason?.trim() || undefined }, ipHash,
      }, c);
      return t.to;
    });
  } catch (err) {
    throw fromDbError(err) ?? err;
  }
}

/** The race a student runs in is decided by their gender: male → Boys' CR, female → Girls' CR. */
export async function getPositionIdForGender(electionId: string, gender: "MALE" | "FEMALE", client?: Parameters<typeof query>[2]) {
  const p = await one<{ id: string }>(`select id from election_positions where election_id = $1 and gender = $2`, [electionId, gender], client);
  if (!p) throw new AppError("NOT_FOUND", "নির্বাচনের পদ পাওয়া যায়নি।");
  return p.id;
}
