#!/usr/bin/env node
/**
 * Independent verification of exported election records — needs only Node.js, no database and no
 * access to the application. Download the files from Admin → "রেকর্ড ও রপ্তানি", then run:
 *
 *   node scripts/verify-records.mjs audit-log.json [corrections.json] [--head <entry_hash>]
 *
 * 1. Audit log: recomputes every entry's SHA-256 hash from the exported fields and checks that each
 *    entry links to the previous one. Any edited, removed or inserted entry breaks the chain.
 *    --head <hash>: also check the chain reaches a head hash written down earlier (e.g. on the
 *    committee notice board). This catches a chain that was rewritten end to end.
 * 2. Corrections record (optional): checks that each request and decision is in the verified audit log
 *    with the same hash, that every approved vote change kept the original ballot (invalidated) and
 *    added exactly one linked replacement for the requested candidate, and recounts the valid ballots.
 *
 * Exit code 0 = everything verified, 1 = a problem was found.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const headIdx = args.indexOf("--head");
const expectedHead = headIdx >= 0 ? args.splice(headIdx, 2)[1] : null;
const [auditPath, correctionsPath] = args;
if (!auditPath) {
  console.error("usage: node scripts/verify-records.mjs audit-log.json [corrections.json] [--head <entry_hash>]");
  process.exit(2);
}

let problems = 0;
const fail = (msg) => { problems++; console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

function entryHash(prev, e) {
  return sha256([prev, e.id, e.occurred_at, e.actor_type, e.actor_admin_id ?? "", e.action, e.entity_type ?? "", e.entity_id ?? "", e.details].join("|"));
}

// ---------------------------------------------------------------- audit log
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
console.log(`Audit log: ${auditPath}`);
if (audit.kind !== "techtitans28.audit-log") fail(`not an audit-log export (kind = ${audit.kind})`);
const entries = audit.entries ?? [];
const byId = new Map();
let prev = "0".repeat(64);
let broken = null;
for (const e of entries) {
  try { JSON.parse(e.details); } catch { if (!broken) broken = `entry #${e.id}: details is not valid JSON`; }
  if (e.prev_hash !== prev && !broken) broken = `entry #${e.id}: prev_hash does not match the previous entry`;
  const calc = entryHash(prev, e);
  if (calc !== e.entry_hash && !broken) broken = `entry #${e.id}: content does not match its hash (edited?)`;
  byId.set(e.id, e);
  prev = e.entry_hash;
}
if (broken) fail(broken);
else pass(`${entries.length} entries, hash chain intact from the first entry to #${entries.at(-1)?.id ?? "-"}`);
const head = entries.at(-1)?.entry_hash ?? null;
if (audit.head && audit.head.entry_hash !== head) fail("the declared head does not match the last entry");
if (expectedHead) {
  if (entries.some((e) => e.entry_hash === expectedHead.toLowerCase())) pass(`the recorded head hash ${expectedHead.slice(0, 16)}… is part of this chain`);
  else fail(`the recorded head hash ${expectedHead.slice(0, 16)}… is NOT in this chain (rewritten or a different database)`);
}
console.log(`  head: ${head}`);

// ---------------------------------------------------------------- corrections
if (correctionsPath) {
  const rec = JSON.parse(readFileSync(correctionsPath, "utf8"));
  console.log(`\nCorrections record: ${correctionsPath} — ${rec.election?.title} (${rec.election?.status})`);
  if (rec.kind !== "techtitans28.corrections") fail(`not a corrections export (kind = ${rec.kind})`);
  if (rec.audit_head) {
    const a = byId.get(rec.audit_head.id);
    const lastId = Number(entries.at(-1)?.id ?? 0);
    if (!a && Number(rec.audit_head.id) > lastId) console.log(`  ⚠ this record is newer than the audit export (head #${rec.audit_head.id} > #${lastId}): export the audit log again, after the corrections record, to check its head too`);
    else if (!a) fail(`its audit head #${rec.audit_head.id} is missing from the audit export`);
    else if (a.entry_hash !== rec.audit_head.entry_hash) fail(`its audit head #${rec.audit_head.id} hash differs from the audit export`);
    else pass(`taken at audit entry #${rec.audit_head.id}, which is in the verified chain`);
  }
  const ledger = rec.ledger ?? [];
  const byRef = new Map(ledger.map((b) => [b.ballot_ref, b]));
  for (const c of rec.corrections ?? []) {
    const label = `${c.correction} ${c.ballot_ref} (${c.status})`;
    const need = ["CORRECTION.REQUESTED"].concat(c.status === "APPROVED" ? ["CORRECTION.APPROVED"] : c.status === "REJECTED" ? ["CORRECTION.REJECTED"] : c.status === "CANCELLED" ? ["CORRECTION.CANCELLED"] : []);
    for (const action of need) {
      const ref = (c.audit_entries ?? []).find((x) => x.action === action);
      const inChain = ref && byId.get(ref.id);
      if (!ref) fail(`${label}: no ${action} audit entry listed`);
      else if (!inChain) fail(`${label}: ${action} entry #${ref.id} is not in the audit export`);
      else if (inChain.entry_hash !== ref.entry_hash || inChain.entity_id !== c.id) fail(`${label}: ${action} entry #${ref.id} does not match the audit log`);
    }
    if (c.status === "APPROVED" && ledger.length) {
      const orig = byRef.get(c.ballot_ref);
      if (!orig) { fail(`${label}: ballot missing from the ledger (deleted?)`); continue; }
      if (c.correction === "REPLACE_CHOICE") {
        const repl = ledger.filter((b) => b.created_by_correction_id === c.id);
        if (orig.status !== "INVALIDATED") fail(`${label}: the original ballot should be kept as INVALIDATED`);
        if (repl.length !== 1) fail(`${label}: expected exactly one replacement ballot, found ${repl.length}`);
        else if (repl[0].replaces_ballot_ref !== c.ballot_ref || repl[0].candidate !== c.to_candidate || repl[0].ballot_ref !== c.replacement_ballot_ref) fail(`${label}: the replacement ballot does not match the approved request`);
        else if (orig.candidate !== c.from_candidate) fail(`${label}: the original ballot's candidate changed (expected ${c.from_candidate})`);
      }
    }
  }
  pass(`${(rec.corrections ?? []).length} correction request(s) checked`);
  if (ledger.length) {
    const orphans = ledger.filter((b) => b.replaces_ballot_ref && !byRef.has(b.replaces_ballot_ref));
    if (orphans.length) fail(`${orphans.length} replacement ballot(s) point to a missing original`);
    const approvedReplace = new Set((rec.corrections ?? []).filter((c) => c.correction === "REPLACE_CHOICE" && c.status === "APPROVED").map((c) => c.id));
    const unexplained = ledger.filter((b) => b.created_by_correction_id && !approvedReplace.has(b.created_by_correction_id));
    if (unexplained.length) fail(`${unexplained.length} replacement ballot(s) without an approved request in this record`);
    const tally = new Map();
    for (const b of ledger) if (b.status === "VALID") tally.set(`${b.position} — ${b.candidate}`, (tally.get(`${b.position} — ${b.candidate}`) ?? 0) + 1);
    console.log(`  recount of VALID ballots (${ledger.length} ballot rows, ${ledger.filter((b) => !b.created_by_correction_id).length} cast by voters):`);
    for (const [k, n] of [...tally].sort()) console.log(`    ${String(n).padStart(4)}  ${k}`);
  }
}

console.log(problems ? `\n✗ ${problems} problem(s) found` : "\n✓ all checks passed");
process.exit(problems ? 1 : 0);
