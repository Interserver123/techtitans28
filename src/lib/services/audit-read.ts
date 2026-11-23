import "server-only";
import { query, one } from "../db";

export type AuditEntry = {
  id: string; occurred_at: Date; actor_type: string; actor_label: string | null; action: string; entity_type: string | null;
  entity_id: string | null; details: Record<string, unknown>; entry_hash: string;
};

export async function listAudit(opts: { action?: string; limit?: number; before?: number }) {
  const limit = Math.min(opts.limit ?? 100, 500);
  return query<AuditEntry>(
    `select id::text, occurred_at, actor_type, actor_label, action, entity_type, entity_id, details, entry_hash
       from audit_logs
      where ($1::text is null or action like $1 || '%') and ($2::bigint is null or id < $2)
      order by id desc limit $3`,
    [opts.action || null, opts.before ?? null, limit],
  );
}

export async function verifyAuditChain() {
  return (await one<{ ok: boolean; entries: string; first_broken_id: string | null }>(`select * from verify_audit_chain()`))!;
}

export async function countAction(prefix: string, sinceHours = 24 * 30) {
  const r = await one<{ n: number }>(
    `select count(*)::int as n from audit_logs where action like $1 || '%' and occurred_at > now() - make_interval(hours => $2)`,
    [prefix, sinceHours],
  );
  return r?.n ?? 0;
}
