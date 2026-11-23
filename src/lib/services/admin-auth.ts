import "server-only";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { query, one, tx } from "../db";
import { DUMMY_PASSWORD_HASH, decrypt, encrypt, hashPassword, hmac, isLegacyHash, randomToken, verifyPassword } from "../crypto";
import { AppError } from "../errors";
import { audit } from "../audit";
import { enforceRateLimit } from "../rate-limit";
import { effectivePermissions, type Permission, type RoleCode } from "../permissions";
import type { RequestContext } from "../http";

export const ADMIN_SESSION_HOURS = 8;
export const ADMIN_IDLE_MINUTES = 30;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export const adminTokenHash = (token: string) => hmac("admin-session", token);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("সঠিক ইমেইল ঠিকানা লিখুন।").max(254),
  password: z.string().min(1, "আপনার পাসওয়ার্ড লিখুন।").max(200),
});
export const totpSchema = z.object({ code: z.string().trim().regex(/^[0-9]{6}$/, "৬ অঙ্কের কোডটি লিখুন।") });

export type AdminIdentity = {
  sessionId: string;
  adminId: string;
  email: string;
  fullName: string;
  role: RoleCode;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  permissions: Set<Permission>;
};

async function newSession(adminId: string, mfaVerified: boolean, ctx: RequestContext, client?: Parameters<typeof query>[2]) {
  const token = randomToken(32);
  await query(
    `insert into admin_sessions (admin_id, token_hash, mfa_verified, expires_at, ip_hash, user_agent)
     values ($1, $2, $3, now() + make_interval(mins => $4), $5, $6)`,
    // A password-only session lives 10 minutes and can only be used to complete MFA.
    [adminId, adminTokenHash(token), mfaVerified, mfaVerified ? ADMIN_SESSION_HOURS * 60 : 10, ctx.ipHash, ctx.userAgent],
    client,
  );
  return token;
}

/** Password step. Produces a session that is NOT yet MFA-verified. */
export async function adminLogin(input: z.infer<typeof loginSchema>, ctx: RequestContext) {
  const { email, password } = loginSchema.parse(input);
  await enforceRateLimit("admin-login-ip", ctx.ip ?? "unknown", 20, 15 * 60);
  await enforceRateLimit("admin-login-email", email, 10, 15 * 60);
  const admin = await one<{ id: string; password_hash: string; is_active: boolean; locked: boolean; mfa_enabled: boolean }>(
    `select id, password_hash, is_active, (locked_until is not null and locked_until > now()) as locked, mfa_enabled
       from election_admins where email = $1`,
    [email],
  );
  const valid = await verifyPassword(password, admin?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!admin || !valid || !admin.is_active || admin.locked) {
    if (admin) {
      await query(
        `update election_admins set failed_login_count = failed_login_count + 1,
           locked_until = case when failed_login_count + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end
         where id = $1`,
        [admin.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
      );
    }
    await audit({
      actorType: "PUBLIC", action: "ADMIN.LOGIN_FAILED", entityType: "election_admin", entityId: admin?.id ?? null,
      details: { email, reason: !admin ? "unknown_account" : admin.locked ? "locked" : !admin.is_active ? "inactive" : "bad_password" },
      ipHash: ctx.ipHash,
    });
    throw new AppError("INVALID_CREDENTIALS");
  }
  await query(`update election_admins set failed_login_count = 0, locked_until = null where id = $1`, [admin.id]);
  if (isLegacyHash(admin.password_hash)) {
    await query(`update election_admins set password_hash = $2 where id = $1`, [admin.id, await hashPassword(password)]);
  }
  const token = await newSession(admin.id, false, ctx);
  await audit({ actorType: "ADMIN", adminId: admin.id, action: "ADMIN.LOGIN_PASSWORD_OK", entityType: "election_admin", entityId: admin.id, ipHash: ctx.ipHash });
  return { token, mfaEnrolled: admin.mfa_enabled };
}

/** Resolves a session cookie into an identity (or null). Applies idle timeout. */
export async function getAdminIdentity(token: string | undefined | null): Promise<AdminIdentity | null> {
  if (!token || token.length > 100) return null;
  const row = await one<{
    session_id: string; admin_id: string; email: string; full_name: string; role_code: RoleCode; mfa_enabled: boolean;
    mfa_verified: boolean; permissions: string[]; can_publish_results: boolean;
  }>(
    `update admin_sessions s set last_seen_at = now()
       from election_admins a join admin_roles r on r.code = a.role_code
      where s.token_hash = $1 and s.admin_id = a.id and s.revoked_at is null and s.expires_at > now()
        and s.last_seen_at > now() - make_interval(mins => $2) and a.is_active
      returning s.id as session_id, a.id as admin_id, a.email, a.full_name, a.role_code, a.mfa_enabled, s.mfa_verified,
                r.permissions, a.can_publish_results`,
    [adminTokenHash(token), ADMIN_IDLE_MINUTES],
  );
  if (!row) return null;
  return {
    sessionId: row.session_id,
    adminId: row.admin_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role_code,
    mfaEnabled: row.mfa_enabled,
    mfaVerified: row.mfa_verified,
    permissions: effectivePermissions(row.permissions, row.role_code, row.can_publish_results),
  };
}

/** Throws unless the session is fully authenticated (password + MFA) and has the permission. */
export async function requireAdmin(token: string | undefined | null, permission: Permission | null, ctx: RequestContext) {
  const id = await getAdminIdentity(token);
  if (!id) throw new AppError("UNAUTHENTICATED");
  if (!id.mfaEnabled || !id.mfaVerified) throw new AppError("MFA_REQUIRED");
  if (permission && !id.permissions.has(permission)) {
    await audit({
      actorType: "ADMIN", adminId: id.adminId, action: "ADMIN.ACCESS_DENIED", entityType: "permission", entityId: permission,
      details: { role: id.role }, ipHash: ctx.ipHash,
    });
    throw new AppError("FORBIDDEN");
  }
  return id;
}

function totp(secret: OTPAuth.Secret, label: string) {
  return new OTPAuth.TOTP({ issuer: "TechTitans-28 Election", label, algorithm: "SHA1", digits: 6, period: 30, secret });
}

/** Begins MFA enrolment: generates a pending secret (encrypted at rest) and a QR code. */
export async function beginMfaEnrollment(token: string) {
  const id = await getAdminIdentity(token);
  if (!id) throw new AppError("UNAUTHENTICATED");
  if (id.mfaEnabled) throw new AppError("INVALID_STATE", "MFA is already enabled for this account.");
  const secret = new OTPAuth.Secret({ size: 20 });
  await query(`update election_admins set mfa_pending_secret_enc = $2 where id = $1`, [id.adminId, encrypt(secret.base32)]);
  const uri = totp(secret, id.email).toString();
  return { otpauthUri: uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }), secret: secret.base32 };
}

/** Verifies a TOTP code, rejecting replays of an already-used time step. */
async function checkTotp(adminId: string, encSecret: string, email: string, code: string, lastStep: number | null, c?: Parameters<typeof query>[2]) {
  const t = totp(OTPAuth.Secret.fromBase32(decrypt(encSecret)), email);
  const delta = t.validate({ token: code, window: 1 });
  if (delta === null) return false;
  const step = Math.floor(Date.now() / 1000 / 30) + delta;
  if (lastStep !== null && step <= Number(lastStep)) return false;
  await query(`update election_admins set mfa_last_step = $2 where id = $1`, [adminId, step], c);
  return true;
}

/**
 * Completes MFA (enrolment confirmation or sign-in challenge). On success the
 * pre-MFA session is revoked and a NEW session token is issued (prevents fixation).
 */
export async function completeMfa(token: string, code: string, ctx: RequestContext) {
  const id = await getAdminIdentity(token);
  if (!id) throw new AppError("UNAUTHENTICATED");
  await enforceRateLimit("admin-mfa", id.adminId, 8, 10 * 60);
  return tx(async (c) => {
    const a = await one<{ email: string; mfa_secret_enc: string | null; mfa_pending_secret_enc: string | null; mfa_enabled: boolean; mfa_last_step: number | null }>(
      `select email, mfa_secret_enc, mfa_pending_secret_enc, mfa_enabled, mfa_last_step from election_admins where id = $1 for update`,
      [id.adminId],
      c,
    );
    if (!a) throw new AppError("UNAUTHENTICATED");
    const enrolling = !a.mfa_enabled;
    const secret = enrolling ? a.mfa_pending_secret_enc : a.mfa_secret_enc;
    if (!secret) throw new AppError("INVALID_STATE", "আগে দুই-ধাপের যাচাই চালু করা শুরু করুন।");
    const okCode = await checkTotp(id.adminId, secret, a.email, code, a.mfa_last_step, c);
    if (!okCode) {
      await audit({ actorType: "ADMIN", adminId: id.adminId, action: "ADMIN.MFA_FAILED", entityType: "election_admin", entityId: id.adminId, ipHash: ctx.ipHash }, c);
      throw new AppError("INVALID_OTP", "যাচাই কোডটি সঠিক নয়।");
    }
    if (enrolling) {
      await query(
        `update election_admins set mfa_secret_enc = mfa_pending_secret_enc, mfa_pending_secret_enc = null, mfa_enabled = true where id = $1`,
        [id.adminId],
        c,
      );
    }
    await query(`update admin_sessions set revoked_at = now() where id = $1`, [id.sessionId], c);
    const fresh = await newSession(id.adminId, true, ctx, c);
    await query(`update election_admins set last_login_at = now() where id = $1`, [id.adminId], c);
    await audit({
      actorType: "ADMIN", adminId: id.adminId, action: enrolling ? "ADMIN.MFA_ENROLLED" : "ADMIN.LOGIN", entityType: "election_admin",
      entityId: id.adminId, details: { role: id.role }, ipHash: ctx.ipHash,
    }, c);
    return fresh;
  });
}

export async function adminLogout(token: string | undefined | null, ctx: RequestContext) {
  if (!token) return;
  const row = await one<{ admin_id: string }>(
    `update admin_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null returning admin_id`,
    [adminTokenHash(token)],
  );
  if (row) await audit({ actorType: "ADMIN", adminId: row.admin_id, action: "ADMIN.LOGOUT", entityType: "election_admin", entityId: row.admin_id, ipHash: ctx.ipHash });
}
