import "server-only";
import { z } from "zod";
import { one, query, tx } from "../db";
import { hmac, randomToken } from "../crypto";
import { AppError } from "../errors";
import { audit } from "../audit";
import { enforceRateLimit } from "../rate-limit";
import { env } from "../env";
import { getCurrentElection } from "./elections";
import { getNumberSetting } from "./settings";
import { assertElectionAcceptsVoters, rollSchema, voterTokenHash } from "./voter-auth";
import type { RequestContext } from "../http";

/**
 * Personal voting links. Only a hash of the link token is stored. A link is tied to ONE student, expires,
 * can be revoked, and still requires that student's roll number. It never bypasses eligibility, the open
 * voting window or the one-ballot-per-student rule (those are enforced again when the ballot is cast).
 */
const linkHash = (token: string) => hmac("access-link", token);

export const accessLinkSchema = z.object({
  hours: z.number().int().min(1).max(72),
  reason: z.string().trim().max(300).optional().default(""),
});

export type AccessLinkRow = { id: string; created_at: Date; expires_at: Date; first_used_at: Date | null; revoked_at: Date | null; reason: string | null; expired: boolean };

export async function createAccessLink(studentId: string, input: z.infer<typeof accessLinkSchema>, adminId: string, ipHash: string | null) {
  const v = accessLinkSchema.parse(input);
  const election = await getCurrentElection();
  if (!election) throw new AppError("NO_ELECTION");
  if (["CLOSED", "RESULTS_PUBLISHED"].includes(election.status)) throw new AppError("ELECTION_CLOSED");
  const student = await one<{ id: string; roll_number: string }>(
    `select id, roll_number from students where id = $1 and is_active and is_eligible and batch = setting_text('election.batch', 'TechTitans-28')`,
    [studentId],
  );
  if (!student) throw new AppError("NOT_ELIGIBLE", "এই শিক্ষার্থী ভোট দেওয়ার যোগ্য নন বা নিষ্ক্রিয়।");
  const voted = await one(`select 1 from voter_participation where election_id = $1 and student_id = $2`, [election.id, studentId]);
  if (voted) throw new AppError("ALREADY_VOTED", "এই শিক্ষার্থী ইতিমধ্যে ভোট দিয়েছেন।");

  const token = randomToken(32);
  const row = await tx(async (c) => {
    // One live link per student: issuing a new one cancels the previous.
    await query(`update voter_access_links set revoked_at = now() where student_id = $1 and election_id = $2 and revoked_at is null`, [studentId, election.id], c);
    return one<{ id: string; expires_at: Date }>(
      `insert into voter_access_links (token_hash, student_id, election_id, created_by, reason, expires_at)
       values ($1, $2, $3, $4, nullif($5, ''), now() + make_interval(hours => $6)) returning id, expires_at`,
      [linkHash(token), studentId, election.id, adminId, v.reason, v.hours],
      c,
    );
  });
  await audit({ actorType: "ADMIN", adminId, action: "VOTER.ACCESS_LINK_CREATED", entityType: "student", entityId: studentId, details: { roll: student.roll_number, hours: v.hours, reason: v.reason || undefined }, ipHash });
  return { id: row!.id, url: `${env().APP_URL.replace(/\/$/, "")}/vote/link/${token}`, expiresAt: row!.expires_at };
}

export async function listAccessLinks(studentId: string) {
  return query<AccessLinkRow>(
    `select id, created_at, expires_at, first_used_at, revoked_at, reason, (expires_at <= now()) as expired
       from voter_access_links where student_id = $1 order by created_at desc limit 10`,
    [studentId],
  );
}

export async function revokeAccessLink(id: string, adminId: string, ipHash: string | null) {
  const r = await one<{ student_id: string }>(`update voter_access_links set revoked_at = now() where id = $1 and revoked_at is null returning student_id`, [id]);
  if (!r) throw new AppError("NOT_FOUND");
  await audit({ actorType: "ADMIN", adminId, action: "VOTER.ACCESS_LINK_REVOKED", entityType: "student", entityId: r.student_id, details: {}, ipHash });
}

/** The student opens their link and confirms their roll number → a normal voting session. */
export async function redeemAccessLink(token: string, rollInput: string, ctx: RequestContext) {
  await enforceRateLimit("link-ip", ctx.ip ?? "unknown", 60, 15 * 60);
  if (!token || token.length < 20 || token.length > 100) throw new AppError("INVALID_LINK");
  const hash = linkHash(token);
  // Guessing the roll number against one link is capped.
  await enforceRateLimit("link-token", hash, 6, 15 * 60);
  const roll = rollSchema.safeParse(rollInput);
  if (!roll.success) throw new AppError("INVALID_LINK");
  const election = await getCurrentElection();
  assertElectionAcceptsVoters(election);

  const row = await one<{ id: string; student_id: string; election_id: string }>(
    `select l.id, l.student_id, l.election_id
       from voter_access_links l join students s on s.id = l.student_id
      where l.token_hash = $1 and l.revoked_at is null and l.expires_at > now() and l.election_id = $2
        and s.roll_number = $3 and s.is_active and s.is_eligible and s.batch = setting_text('election.batch', 'TechTitans-28')`,
    [hash, election.id, roll.data],
  );
  if (!row) {
    await audit({ actorType: "VOTER", action: "VOTER.ACCESS_LINK_FAILED", entityType: "access_link", details: {}, ipHash: ctx.ipHash }).catch(() => {});
    throw new AppError("INVALID_LINK");
  }

  const ttlMinutes = await getNumberSetting("voter.session_minutes", 15);
  return tx(async (c) => {
    await query(`update voter_access_links set first_used_at = coalesce(first_used_at, now()) where id = $1`, [row.id], c);
    await query(`update voter_credentials set revoked_at = now() where student_id = $1 and revoked_at is null`, [row.student_id], c);
    const sessionToken = randomToken(32);
    const cred = await one<{ expires_at: Date }>(
      `insert into voter_credentials (token_hash, student_id, election_id, expires_at)
       values ($1, $2, $3, now() + make_interval(mins => $4)) returning expires_at`,
      [voterTokenHash(sessionToken), row.student_id, row.election_id, ttlMinutes],
      c,
    );
    await audit({ actorType: "VOTER", action: "VOTER.ACCESS_LINK_USED", entityType: "student", entityId: row.student_id, details: {}, ipHash: ctx.ipHash }, c);
    return { token: sessionToken, expiresAt: cred!.expires_at };
  });
}
