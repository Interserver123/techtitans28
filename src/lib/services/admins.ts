import "server-only";
import { z } from "zod";
import { query, one, tx } from "../db";
import { hashPassword } from "../crypto";
import { AppError, fromDbError } from "../errors";
import { audit } from "../audit";
import { ROLE_CODES } from "../permissions";

export const passwordPolicy = z
  .string()
  .min(12, "Passwords must be at least 12 characters.")
  .max(200)
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p), "Use upper- and lower-case letters and digits.");

export const adminCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(2).max(120),
  designation: z.string().trim().max(120).optional().default(""),
  role: z.enum(ROLE_CODES),
  canPublishResults: z.boolean().optional().default(false),
  password: passwordPolicy,
});

export const adminUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  designation: z.string().trim().max(120).optional().default(""),
  role: z.enum(ROLE_CODES),
  canPublishResults: z.boolean(),
  isActive: z.boolean(),
});

export async function listAdmins() {
  return query<{
    id: string; email: string; full_name: string; designation: string | null; role_code: string; can_publish_results: boolean;
    mfa_enabled: boolean; is_active: boolean; last_login_at: Date | null; created_at: Date; locked: boolean;
  }>(
    `select id, email, full_name, designation, role_code, can_publish_results, mfa_enabled, is_active, last_login_at, created_at,
            (locked_until is not null and locked_until > now()) as locked
       from election_admins order by created_at`,
  );
}

export async function createAdmin(input: z.input<typeof adminCreateSchema>, actorId: string | null, ipHash: string | null) {
  const v = adminCreateSchema.parse(input);
  const hash = await hashPassword(v.password);
  try {
    return await tx(async (c) => {
      const row = await one<{ id: string }>(
        `insert into election_admins (email, full_name, designation, role_code, can_publish_results, password_hash, created_by)
         values ($1, $2, nullif($3, ''), $4, $5, $6, $7) returning id`,
        [v.email, v.fullName, v.designation, v.role, v.role === "RESULTS_OFFICER" ? v.canPublishResults : false, hash, actorId],
        c,
      );
      await audit({ actorType: actorId ? "ADMIN" : "SYSTEM", adminId: actorId, action: "ADMIN.CREATED", entityType: "election_admin", entityId: row!.id, details: { email: v.email, role: v.role, can_publish_results: v.canPublishResults }, ipHash }, c);
      return row!.id;
    });
  } catch (e) {
    const mapped = fromDbError(e);
    if (mapped?.code === "CONFLICT") throw new AppError("CONFLICT", "An administrator with this email already exists.");
    throw mapped ?? e;
  }
}

export async function updateAdmin(id: string, input: z.input<typeof adminUpdateSchema>, actorId: string, ipHash: string | null) {
  const v = adminUpdateSchema.parse(input);
  await tx(async (c) => {
    const before = await one<{ role_code: string; is_active: boolean; can_publish_results: boolean }>(
      `select role_code, is_active, can_publish_results from election_admins where id = $1 for update`, [id], c);
    if (!before) throw new AppError("NOT_FOUND");
    if (id === actorId && (v.role !== "SUPER_ADMIN" || !v.isActive)) {
      throw new AppError("INVALID_STATE", "You cannot demote or deactivate your own account.");
    }
    if (before.role_code === "SUPER_ADMIN" && (v.role !== "SUPER_ADMIN" || !v.isActive)) {
      const others = await one<{ n: number }>(
        `select count(*)::int as n from election_admins where role_code = 'SUPER_ADMIN' and is_active and id <> $1`, [id], c);
      if ((others?.n ?? 0) < 1) throw new AppError("INVALID_STATE", "At least one active Super Admin must remain.");
    }
    await query(
      `update election_admins set full_name = $2, designation = nullif($3, ''), role_code = $4, can_publish_results = $5, is_active = $6 where id = $1`,
      [id, v.fullName, v.designation, v.role, v.role === "RESULTS_OFFICER" ? v.canPublishResults : false, v.isActive],
      c,
    );
    if (!v.isActive || v.role !== before.role_code) {
      await query(`update admin_sessions set revoked_at = now() where admin_id = $1 and revoked_at is null`, [id], c);
    }
    await audit({
      actorType: "ADMIN", adminId: actorId, action: "ADMIN.UPDATED", entityType: "election_admin", entityId: id,
      details: { before, after: { role_code: v.role, is_active: v.isActive, can_publish_results: v.canPublishResults } }, ipHash,
    }, c);
  });
}

/** Resets a lost authenticator. The admin must enrol again at next sign-in. */
export async function resetAdminMfa(id: string, actorId: string, ipHash: string | null) {
  if (id === actorId) throw new AppError("INVALID_STATE", "Ask another Super Admin to reset your MFA.");
  await tx(async (c) => {
    const r = await one(`update election_admins set mfa_enabled = false, mfa_secret_enc = null, mfa_pending_secret_enc = null, mfa_last_step = null where id = $1 returning id`, [id], c);
    if (!r) throw new AppError("NOT_FOUND");
    await query(`update admin_sessions set revoked_at = now() where admin_id = $1 and revoked_at is null`, [id], c);
    await audit({ actorType: "ADMIN", adminId: actorId, action: "ADMIN.MFA_RESET", entityType: "election_admin", entityId: id, ipHash }, c);
  });
}

export async function resetAdminPassword(id: string, password: string, actorId: string, ipHash: string | null) {
  const pw = passwordPolicy.parse(password);
  const hash = await hashPassword(pw);
  await tx(async (c) => {
    const r = await one(`update election_admins set password_hash = $2, failed_login_count = 0, locked_until = null where id = $1 returning id`, [id, hash], c);
    if (!r) throw new AppError("NOT_FOUND");
    await query(`update admin_sessions set revoked_at = now() where admin_id = $1 and revoked_at is null`, [id], c);
    await audit({ actorType: "ADMIN", adminId: actorId, action: "ADMIN.PASSWORD_RESET", entityType: "election_admin", entityId: id, ipHash }, c);
  });
}
