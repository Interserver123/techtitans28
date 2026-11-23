import "server-only";
import { one, type Queryable } from "./db";

export type AuditInput = {
  actorType: "ADMIN" | "SYSTEM" | "PUBLIC" | "VOTER";
  adminId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipHash?: string | null;
};

const FORBIDDEN_KEYS = /otp|code_hash|password|secret|token|candidate_choice/i;

/** Defensive scrub: secrets and ballot selections must never reach the audit log. */
function scrub(details: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function audit(input: AuditInput, client?: Queryable) {
  await one(
    "select append_audit($1, $2, $3, $4, $5, $6::jsonb, $7) as id",
    [
      input.actorType,
      input.adminId ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      JSON.stringify(scrub(input.details)),
      input.ipHash ?? null,
    ],
    client,
  );
}
