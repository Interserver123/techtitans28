import "server-only";
import { query, one } from "../db";
import { AppError, fromDbError } from "../errors";
import { audit } from "../audit";
import { listCorrections } from "./corrections";
import { getBallotLedger } from "./results";

/**
 * Authorised election record exports. Every export is itself written to the audit log BEFORE the
 * data is read, so an audit export always contains the entry recording that it was made.
 *
 * The audit export carries the exact strings the database hashed, so anyone can re-compute the
 * hash chain offline with scripts/verify-records.mjs, without database access.
 */

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
};

/** Who voted (participation only) — never what they chose. */
export async function participationCsv(electionId: string, adminId: string, ipHash: string | null) {
  const rows = await query<{ roll_number: string; full_name: string; is_eligible: boolean; is_active: boolean; voted_at: Date | null }>(
    `select s.roll_number, s.full_name, s.is_eligible, s.is_active, p.voted_at
       from students s left join voter_participation p on p.student_id = s.id and p.election_id = $1
      where s.batch = (select coalesce((select value #>> '{}' from system_settings where key = 'election.batch'), 'TechTitans-28'))
      order by s.roll_number`,
    [electionId],
  );
  await audit({ actorType: "ADMIN", adminId, action: "EXPORT.PARTICIPATION", entityType: "election", entityId: electionId, details: { rows: rows.length }, ipHash });
  const header = "roll_number,full_name,eligible,active,voted,voted_at_utc";
  return [header].concat(rows.map((r) => [r.roll_number, r.full_name, r.is_eligible, r.is_active, r.voted_at ? "yes" : "no", r.voted_at ? new Date(r.voted_at).toISOString() : ""].map(csvCell).join(","))).join("\r\n") + "\r\n";
}

export type AuditExportEntry = {
  id: string; occurred_at: string; actor_type: string; actor_admin_id: string | null; actor_label: string | null;
  action: string; entity_type: string | null; entity_id: string | null; details: string; prev_hash: string; entry_hash: string;
};

const HASH_RULE =
  "entry_hash = sha256_hex(prev_hash + '|' + id + '|' + occurred_at + '|' + actor_type + '|' + (actor_admin_id or '') + '|' + action + '|' + (entity_type or '') + '|' + (entity_id or '') + '|' + details); the first entry's prev_hash is 64 zeros; every later prev_hash equals the previous entry_hash. 'details' is the exact JSON text that was hashed.";

async function auditHead() {
  return one<{ id: string; entry_hash: string }>(`select id::text, entry_hash from audit_logs order by audit_logs.id desc limit 1`);
}

/** The complete administrative activity log, with everything needed to re-verify the hash chain. */
export async function auditExport(adminId: string, ipHash: string | null) {
  await audit({ actorType: "ADMIN", adminId, action: "EXPORT.AUDIT_LOG", entityType: "audit_log", ipHash });
  const entries = await query<AuditExportEntry>(
    `select id::text, to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as occurred_at,
            actor_type, actor_admin_id::text, actor_label, action, entity_type, entity_id, details::text as details, prev_hash, entry_hash
       from audit_logs order by audit_logs.id`,
  );
  const chain = await one<{ ok: boolean; entries: string; first_broken_id: string | null }>(`select * from verify_audit_chain()`);
  return {
    kind: "techtitans28.audit-log",
    version: 1,
    generated_at: new Date().toISOString(),
    hash_rule: HASH_RULE,
    database_chain_check: chain,
    head: entries.length ? { id: entries[entries.length - 1].id, entry_hash: entries[entries.length - 1].entry_hash } : null,
    entries,
  };
}

/**
 * Every correction request for one election (requested, approved, rejected, cancelled), the audit
 * entries that recorded each step, and — once voting has closed — the anonymous ballot ledger, so the
 * effect of each approved correction can be checked ballot by ballot. Never contains voter identities.
 */
export async function correctionsExport(electionId: string, adminId: string, ipHash: string | null) {
  const el = await one<{ id: string; title: string; status: string; results_verified_hash: string | null }>(
    `select id, title, status::text, results_verified_hash from elections where id = $1`, [electionId]);
  if (!el) throw new AppError("NOT_FOUND");
  await audit({ actorType: "ADMIN", adminId, action: "EXPORT.CORRECTIONS", entityType: "election", entityId: electionId, ipHash });
  const closed = ["CLOSED", "RESULTS_PUBLISHED"].includes(el.status);
  const corrections = closed ? await listCorrections(electionId) : [];
  const ids = corrections.map((c) => c.id);
  const auditRows = ids.length
    ? await query<{ id: string; action: string; entity_id: string; entry_hash: string }>(
        `select id::text, action, entity_id, entry_hash from audit_logs
          where entity_type = 'correction_request' and entity_id = any($1::text[]) order by audit_logs.id`, [ids])
    : [];
  const ledger = closed ? await getBallotLedger(electionId) : [];
  let tallyHash: string | null = null;
  if (closed) {
    try {
      tallyHash = (await one<{ h: string }>(`select tally_hash($1) as h`, [electionId]))!.h;
    } catch (e) {
      throw fromDbError(e) ?? e;
    }
  }
  return {
    kind: "techtitans28.corrections",
    version: 1,
    generated_at: new Date().toISOString(),
    election: { id: el.id, title: el.title, status: el.status, results_verified_hash: el.results_verified_hash, current_tally_hash: tallyHash },
    note: closed ? null : "Voting has not closed: the ballot ledger is sealed and corrections are not possible yet.",
    audit_head: await auditHead(),
    corrections: corrections.map((c) => ({
      id: c.id, correction: c.correction, status: c.status, ballot_ref: c.ballot_ref, reason: c.reason, evidence_note: c.evidence_note,
      has_evidence_file: Boolean(c.evidence_path), from_candidate: c.from_candidate, to_candidate: c.to_candidate, replacement_ballot_ref: c.replacement_ref,
      requested_by: c.requester_name, requested_at: new Date(c.requested_at).toISOString(),
      reviewed_by: c.reviewer_name, reviewed_at: c.reviewed_at ? new Date(c.reviewed_at).toISOString() : null, review_note: c.review_note,
      ballot_status_before: c.ballot_status_before,
      audit_entries: auditRows.filter((a) => a.entity_id === c.id).map((a) => ({ id: a.id, action: a.action, entry_hash: a.entry_hash })),
    })),
    ledger: ledger.map((b) => ({
      ballot_ref: b.ballot_ref, position: b.position_title, candidate: b.candidate_name, status: b.status,
      last_correction_id: b.last_correction_id, replaces_ballot_ref: b.replaces_ballot_ref ?? null, created_by_correction_id: b.created_by_correction_id ?? null,
    })),
  };
}
