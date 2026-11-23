import "server-only";
import { z } from "zod";
import { query, one, tx } from "../db";
import { hmac, numericOtp, randomToken, safeEqual } from "../crypto";
import { AppError } from "../errors";
import { audit } from "../audit";
import { enforceRateLimit, rateLimit } from "../rate-limit";
import { otpProvider } from "../otp/provider";
import { getCurrentElection, isVotingOpen, type Election } from "./elections";
import { getNumberSetting } from "./settings";
import { maskContact } from "../mask";
import { otpStatus } from "../otp/provider";
import type { RequestContext } from "../http";

export const rollSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,20}$/, "Enter a valid university roll number.");
export const otpCodeSchema = z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code.");

const challengeHash = (challengeId: string) => hmac("otp-challenge", challengeId);
const codeHash = (challengeId: string, code: string) => hmac("otp-code", `${challengeId}:${code}`);
export const voterTokenHash = (token: string) => hmac("voter-session", token);

export function assertElectionAcceptsVoters(e: Election | null): asserts e is Election {
  if (!e) throw new AppError("NO_ELECTION");
  if (e.status === "PAUSED") throw new AppError("ELECTION_PAUSED");
  if (e.status === "CLOSED" || e.status === "RESULTS_PUBLISHED" || new Date() >= new Date(e.closes_at)) throw new AppError("ELECTION_CLOSED");
  if (!isVotingOpen(e)) throw new AppError("ELECTION_NOT_OPEN");
}

/**
 * Step 1 of the voter flow: "who is this roll number?" Returns the student's name and a PARTLY HIDDEN
 * contact so they can confirm it is them and where the code will go. Nothing else about the student
 * (and never whether they have already voted) is revealed. Unknown / ineligible rolls get an error.
 */
export async function lookupVoter(rollInput: string, ctx: RequestContext) {
  const roll = rollSchema.parse(rollInput);
  // Lookups reveal a name, so they are rate-limited harder than code requests (a batch can share one campus IP).
  await enforceRateLimit("lookup-ip", ctx.ip ?? "unknown", 120, 15 * 60);
  await enforceRateLimit("lookup-roll", roll, 20, 15 * 60);
  const election = await getCurrentElection();
  assertElectionAcceptsVoters(election);
  const s = await one<{ full_name: string; contact_type: "EMAIL" | "PHONE"; contact_value: string }>(
    `select full_name, contact_type, contact_value from students
      where roll_number = $1 and is_active and is_eligible and batch = setting_text('election.batch', 'TechTitans-28')`,
    [roll],
  );
  if (!s) throw new AppError("NOT_ELIGIBLE", "This roll number is not on the voter list or is not eligible to vote.");
  const st = otpStatus();
  const deliverable = st.mode === "dev" || (s.contact_type === "EMAIL" ? st.email : st.sms);
  return { roll, fullName: s.full_name, contactType: s.contact_type, maskedContact: maskContact(s.contact_type, s.contact_value), deliverable };
}

type EligibleStudent = { id: string; full_name: string; contact_type: "EMAIL" | "PHONE"; contact_value: string };

/**
 * Step 1–3 of the voter flow. The response is IDENTICAL whether or not the roll
 * exists / is eligible, so the endpoint cannot be used to enumerate the register.
 * Delivery happens in `deliver`, which the route runs after the response is sent
 * (equalising response timing as well).
 */
export async function requestOtp(rollInput: string, ctx: RequestContext) {
  const roll = rollSchema.parse(rollInput);
  // Generous per-IP ceiling: an entire batch may vote from one campus NAT address.
  // Per-roll cooldowns below are the primary abuse control.
  await enforceRateLimit("otp-ip", ctx.ip ?? "unknown", 300, 15 * 60);
  const election = await getCurrentElection();
  assertElectionAcceptsVoters(election);

  const cooldown = await getNumberSetting("otp.resend_cooldown_seconds", 60);
  // Cooldown keyed on the submitted roll text (independent of whether it exists).
  if (!(await rateLimit("otp-roll-cooldown", roll, 1, cooldown))) {
    throw new AppError("RATE_LIMITED", `Please wait ${cooldown} seconds before requesting another code.`);
  }
  await enforceRateLimit("otp-roll-hourly", roll, 6, 60 * 60);

  const challengeId = randomToken(32);
  const student = await one<EligibleStudent>(
    `select id, full_name, contact_type, contact_value from students
      where roll_number = $1 and is_active and is_eligible and batch = setting_text('election.batch', 'TechTitans-28')`,
    [roll],
  );

  let deliver: () => Promise<void> = async () => {};
  if (student) {
    const ttl = await getNumberSetting("otp.ttl_seconds", 300);
    const maxAttempts = await getNumberSetting("otp.max_attempts", 5);
    const code = numericOtp(6);
    await tx(async (c) => {
      await query(
        `update otp_verifications set invalidated_at = now()
          where student_id = $1 and consumed_at is null and invalidated_at is null`,
        [student.id],
        c,
      );
      await query(
        `insert into otp_verifications (challenge_hash, student_id, election_id, code_hash, max_attempts, expires_at)
         values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
        [challengeHash(challengeId), student.id, election.id, codeHash(challengeId, code), maxAttempts, ttl],
        c,
      );
    });
    deliver = async () => {
      try {
        await otpProvider().send({
          contactType: student.contact_type,
          to: student.contact_value,
          code,
          studentName: student.full_name,
          ttlMinutes: Math.round(ttl / 60),
        });
      } catch (err) {
        await audit({
          actorType: "SYSTEM", action: "VOTER.OTP_DELIVERY_FAILED", entityType: "student", entityId: student.id,
          details: { channel: student.contact_type, error: (err as Error).message.slice(0, 120) }, ipHash: ctx.ipHash,
        }).catch(() => {});
      }
    };
  }
  return { challengeId, deliver };
}

/** Step 4–5: verify the OTP server-side and mint a fresh voting session. */
export async function verifyOtp(challengeId: string | undefined, codeInput: string, ctx: RequestContext) {
  const code = otpCodeSchema.parse(codeInput);
  await enforceRateLimit("otp-verify-ip", ctx.ip ?? "unknown", 600, 15 * 60);
  if (!challengeId || challengeId.length < 20 || challengeId.length > 100) throw new AppError("INVALID_OTP");

  const row = await one<{
    id: string; student_id: string; election_id: string; code_hash: string; attempts: number; max_attempts: number;
    expired: boolean; consumed_at: Date | null; invalidated_at: Date | null;
  }>(
    `select id, student_id, election_id, code_hash, attempts, max_attempts, (expires_at <= now()) as expired, consumed_at, invalidated_at
       from otp_verifications where challenge_hash = $1`,
    [challengeHash(challengeId)],
  );
  const candidateHash = codeHash(challengeId, code);
  if (!row || row.consumed_at || row.invalidated_at || row.expired) throw new AppError("INVALID_OTP");
  if (row.attempts >= row.max_attempts) throw new AppError("OTP_LOCKED");

  if (!safeEqual(candidateHash, row.code_hash)) {
    const upd = await one<{ attempts: number; max_attempts: number }>(
      `update otp_verifications set attempts = attempts + 1 where id = $1 returning attempts, max_attempts`,
      [row.id],
    );
    await audit({ actorType: "VOTER", action: "VOTER.OTP_FAILED", entityType: "student", entityId: row.student_id, details: { attempt: upd?.attempts }, ipHash: ctx.ipHash });
    if (upd && upd.attempts >= upd.max_attempts) throw new AppError("OTP_LOCKED");
    throw new AppError("INVALID_OTP");
  }

  const ttlMinutes = await getNumberSetting("voter.session_minutes", 15);
  return tx(async (c) => {
    // Single-use: only one concurrent verification can consume the challenge.
    const consumed = await one(
      `update otp_verifications set consumed_at = now()
        where id = $1 and consumed_at is null and invalidated_at is null and expires_at > now() and attempts < max_attempts
        returning id`,
      [row.id],
      c,
    );
    if (!consumed) throw new AppError("INVALID_OTP");
    const student = await one(
      `select id from students where id = $1 and is_active and is_eligible and batch = setting_text('election.batch', 'TechTitans-28')`,
      [row.student_id],
      c,
    );
    if (!student) throw new AppError("NOT_ELIGIBLE");
    // Session fixation defence: the token is freshly generated server-side here; all
    // previous credentials for this voter are revoked.
    await query(`update voter_credentials set revoked_at = now() where student_id = $1 and revoked_at is null`, [row.student_id], c);
    const token = randomToken(32);
    const cred = await one<{ expires_at: Date }>(
      `insert into voter_credentials (token_hash, student_id, election_id, expires_at)
       values ($1, $2, $3, now() + make_interval(mins => $4)) returning expires_at`,
      [voterTokenHash(token), row.student_id, row.election_id, ttlMinutes],
      c,
    );
    return { token, expiresAt: cred!.expires_at };
  });
}

export type VoterSession = {
  studentId: string;
  fullName: string;
  rollNumber: string;
  electionId: string;
  electionTitle: string;
  expiresAt: Date;
  hasVoted: boolean;
  receiptCode: string | null;
  votedAt: Date | null;
};

export async function getVoterSession(token: string | undefined | null): Promise<VoterSession | null> {
  if (!token || token.length > 100) return null;
  const row = await one<VoterSession>(
    `select s.id as "studentId", s.full_name as "fullName", s.roll_number as "rollNumber",
            e.id as "electionId", e.title as "electionTitle", c.expires_at as "expiresAt",
            (p.id is not null) as "hasVoted", p.receipt_code as "receiptCode", p.voted_at as "votedAt"
       from voter_credentials c
       join students s on s.id = c.student_id
       join elections e on e.id = c.election_id
       left join voter_participation p on p.election_id = c.election_id and p.student_id = c.student_id
      where c.token_hash = $1 and c.revoked_at is null and c.expires_at > now()`,
    [voterTokenHash(token)],
  );
  return row;
}

export async function endVoterSession(token: string | undefined | null) {
  if (!token) return;
  await query(`update voter_credentials set revoked_at = now() where token_hash = $1 and revoked_at is null`, [voterTokenHash(token)]);
}
