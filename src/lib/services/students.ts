import "server-only";
import { z } from "zod";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";
import { query, one, tx } from "../db";
import { AppError, fromDbError } from "../errors";
import { audit } from "../audit";

export type Student = {
  id: string;
  roll_number: string;
  full_name: string;
  contact_type: "EMAIL" | "PHONE";
  contact_value: string;
  batch: string;
  is_eligible: boolean;
  is_active: boolean;
  notes: string | null;
  is_dev_seed: boolean;
  created_at: Date;
  updated_at: Date;
  has_voted?: boolean;
};

const phone = /^\+?[0-9]{10,15}$/;
const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Normalises Bangladeshi mobile numbers (01XXXXXXXXX → +8801XXXXXXXXX). */
export function normalizeContact(type: "EMAIL" | "PHONE", value: string) {
  const v = value.trim();
  if (type === "EMAIL") return v.toLowerCase();
  const digits = v.replace(/[\s()-]/g, "");
  if (/^01[3-9][0-9]{8}$/.test(digits)) return `+88${digits}`;
  if (/^8801[3-9][0-9]{8}$/.test(digits)) return `+${digits}`;
  return digits;
}

export function inferContactType(value: string): "EMAIL" | "PHONE" {
  return value.includes("@") ? "EMAIL" : "PHONE";
}

export const studentSchema = z
  .object({
    rollNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, "রোল নম্বরে ৩–২০টি ইংরেজি অক্ষর, অঙ্ক বা হাইফেন থাকতে হবে।"),
    fullName: z.string().trim().min(2, "নাম খুব ছোট।").max(120, "নাম খুব বড়।"),
    contactType: z.enum(["EMAIL", "PHONE"]).optional(),
    contactValue: z.string().trim().min(5, "যোগাযোগের তথ্য আবশ্যক।").max(254),
    batch: z.string().trim().min(2).max(40),
    isEligible: z.boolean().default(true),
    isActive: z.boolean().default(true),
    notes: z.string().trim().max(500).optional().default(""),
  })
  .transform((v) => {
    const contactType = v.contactType ?? inferContactType(v.contactValue);
    return { ...v, contactType, contactValue: normalizeContact(contactType, v.contactValue) };
  })
  .superRefine((v, ctx) => {
    if (v.contactType === "EMAIL" && !email.test(v.contactValue)) ctx.addIssue({ code: "custom", path: ["contactValue"], message: "ইমেইল ঠিকানা সঠিক নয়।" });
    if (v.contactType === "PHONE" && !phone.test(v.contactValue)) ctx.addIssue({ code: "custom", path: ["contactValue"], message: "ফোন নম্বর সঠিক নয়।" });
  });
export type StudentInput = z.input<typeof studentSchema>;

export type StudentFilter = { q?: string; voted?: "yes" | "no" | ""; status?: "active" | "inactive" | "ineligible" | ""; page?: number; pageSize?: number; electionId?: string | null };

export async function listStudents(f: StudentFilter) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 5), 200);
  const page = Math.max(f.page ?? 1, 1);
  const where: string[] = [];
  const params: unknown[] = [f.electionId ?? null];
  if (f.q) {
    params.push(`%${f.q.trim().toLowerCase().replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`(lower(s.full_name) like $${params.length} or lower(s.roll_number) like $${params.length})`);
  }
  if (f.voted === "yes") where.push("p.id is not null");
  if (f.voted === "no") where.push("p.id is null");
  if (f.status === "active") where.push("s.is_active and s.is_eligible");
  if (f.status === "inactive") where.push("not s.is_active");
  if (f.status === "ineligible") where.push("not s.is_eligible");
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const base = `from students s left join voter_participation p on p.student_id = s.id and p.election_id = $1 ${w}`;
  const total = await one<{ n: number }>(`select count(*)::int as n ${base}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query<Student>(
    `select s.*, (p.id is not null) as has_voted ${base} order by s.roll_number limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return { rows, total: total?.n ?? 0, page, pageSize };
}

export async function getStudent(id: string) {
  const s = await one<Student>(`select * from students where id = $1`, [id]);
  if (!s) throw new AppError("NOT_FOUND");
  return s;
}

export async function createStudent(input: StudentInput, adminId: string, ipHash: string | null) {
  const v = studentSchema.parse(input);
  try {
    return await tx(async (c) => {
      const row = await one<{ id: string }>(
        `insert into students (roll_number, full_name, contact_type, contact_value, batch, is_eligible, is_active, notes)
         values ($1, $2, $3, $4, $5, $6, $7, nullif($8, '')) returning id`,
        [v.rollNumber, v.fullName, v.contactType, v.contactValue, v.batch, v.isEligible, v.isActive, v.notes],
        c,
      );
      await audit({ actorType: "ADMIN", adminId, action: "STUDENT.CREATED", entityType: "student", entityId: row!.id, details: { roll_number: v.rollNumber, batch: v.batch }, ipHash }, c);
      return row!.id;
    });
  } catch (e) {
    const m = fromDbError(e);
    if (m?.code === "CONFLICT") throw new AppError("CONFLICT", "A student with this roll number already exists.");
    throw m ?? e;
  }
}

export async function updateStudent(id: string, input: StudentInput, adminId: string, ipHash: string | null) {
  const v = studentSchema.parse(input);
  try {
    await tx(async (c) => {
      const before = await one<Student>(`select * from students where id = $1 for update`, [id], c);
      if (!before) throw new AppError("NOT_FOUND");
      await query(
        `update students set roll_number = $2, full_name = $3, contact_type = $4, contact_value = $5, batch = $6,
            is_eligible = $7, is_active = $8, notes = nullif($9, '') where id = $1`,
        [id, v.rollNumber, v.fullName, v.contactType, v.contactValue, v.batch, v.isEligible, v.isActive, v.notes],
        c,
      );
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      const pairs: [string, unknown, unknown][] = [
        ["roll_number", before.roll_number, v.rollNumber], ["full_name", before.full_name, v.fullName],
        ["contact_type", before.contact_type, v.contactType], ["contact_changed", false, before.contact_value !== v.contactValue],
        ["batch", before.batch, v.batch], ["is_eligible", before.is_eligible, v.isEligible], ["is_active", before.is_active, v.isActive],
      ];
      for (const [k, a, b] of pairs) if (a !== b) changed[k] = { from: a, to: b };
      // Contact values are personal data; the audit log records only that they changed.
      await audit({ actorType: "ADMIN", adminId, action: "STUDENT.UPDATED", entityType: "student", entityId: id, details: { roll_number: v.rollNumber, changed }, ipHash }, c);
      if (!v.isActive || !v.isEligible) {
        await query(`update voter_credentials set revoked_at = now() where student_id = $1 and revoked_at is null`, [id], c);
      }
    });
  } catch (e) {
    const m = fromDbError(e);
    if (m?.code === "CONFLICT") throw new AppError("CONFLICT", "অন্য একজন শিক্ষার্থীর এই রোল নম্বর আছে।");
    throw m ?? e;
  }
}

export async function setStudentActive(id: string, active: boolean, adminId: string, ipHash: string | null) {
  await tx(async (c) => {
    const r = await one<{ roll_number: string }>(`update students set is_active = $2 where id = $1 returning roll_number`, [id, active], c);
    if (!r) throw new AppError("NOT_FOUND");
    if (!active) await query(`update voter_credentials set revoked_at = now() where student_id = $1 and revoked_at is null`, [id], c);
    await audit({ actorType: "ADMIN", adminId, action: active ? "STUDENT.REACTIVATED" : "STUDENT.DEACTIVATED", entityType: "student", entityId: id, details: { roll_number: r.roll_number }, ipHash }, c);
  });
}

// ---------------------------------------------------------------------------
// Import (CSV / XLSX): parse → validate → preview → commit
// ---------------------------------------------------------------------------
export type ImportRow = { row: number; data?: z.output<typeof studentSchema>; errors: string[]; warnings: string[]; action?: "insert" | "update" | "skip" };
export type ImportPreview = { rows: ImportRow[]; summary: { total: number; valid: number; invalid: number; inserts: number; updates: number; skips: number } };

const HEADER_ALIASES: Record<string, keyof StudentInput> = {
  roll: "rollNumber", roll_number: "rollNumber", rollnumber: "rollNumber", roll_no: "rollNumber", "roll no": "rollNumber", "university roll": "rollNumber", id: "rollNumber",
  name: "fullName", full_name: "fullName", fullname: "fullName", "full name": "fullName", student_name: "fullName", "student name": "fullName",
  email: "contactValue", phone: "contactValue", mobile: "contactValue", contact: "contactValue", contact_value: "contactValue", "registered contact": "contactValue",
  contact_type: "contactType", "contact type": "contactType",
  batch: "batch", session: "batch",
  eligible: "isEligible", is_eligible: "isEligible", eligibility: "isEligible",
  active: "isActive", is_active: "isActive", status: "isActive",
  notes: "notes",
};

const MAX_IMPORT_ROWS = 2000;

function toBool(v: unknown, dflt: boolean) {
  if (v === undefined || v === null || v === "") return dflt;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "1", "eligible", "active"].includes(s)) return true;
  if (["false", "no", "n", "0", "ineligible", "inactive", "deactivated"].includes(s)) return false;
  return undefined;
}

export async function parseImportFile(filename: string, bytes: Buffer): Promise<Record<string, unknown>[]> {
  if (bytes.length > 2 * 1024 * 1024) throw new AppError("PAYLOAD_TOO_LARGE", "ইমপোর্ট ফাইল সর্বোচ্চ ২ MB হতে পারে।");
  const lower = filename.toLowerCase();
  let table: unknown[][];
  if (lower.endsWith(".xlsx")) {
    if (bytes.subarray(0, 2).toString("ascii") !== "PK") throw new AppError("UNSUPPORTED_MEDIA", "ফাইলটি সঠিক .xlsx ওয়ার্কবুক নয়।");
    try {
      table = (await readSheet(bytes)) as unknown[][];
    } catch {
      throw new AppError("UNSUPPORTED_MEDIA", "ওয়ার্কবুকটি পড়া যায়নি।");
    }
  } else if (lower.endsWith(".csv")) {
    const text = bytes.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    table = parsed.data;
  } else {
    throw new AppError("UNSUPPORTED_MEDIA", ".csv বা .xlsx ফাইল আপলোড করুন।");
  }
  if (table.length < 2) throw new AppError("VALIDATION", "ফাইলে কোনো তথ্যের সারি নেই।");
  if (table.length - 1 > MAX_IMPORT_ROWS) throw new AppError("VALIDATION", `A single import may contain at most ${MAX_IMPORT_ROWS} rows.`);
  const headers = table[0].map((h) => HEADER_ALIASES[String(h ?? "").trim().toLowerCase()] ?? null);
  if (!headers.includes("rollNumber") || !headers.includes("fullName") || !headers.includes("contactValue")) {
    throw new AppError("VALIDATION", "আবশ্যক কলাম: roll_number, full_name, contact (ইমেইল বা ফোন)। ঐচ্ছিক: batch, eligible, active, notes।");
  }
  return table.slice(1).map((cells) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((key, i) => {
      if (key) obj[key] = cells[i] instanceof Date ? (cells[i] as Date).toISOString() : (cells[i] ?? "");
    });
    return obj;
  });
}

export async function previewImport(records: Record<string, unknown>[], defaultBatch: string, mode: "insert_only" | "upsert"): Promise<ImportPreview> {
  const rows: ImportRow[] = [];
  const seenRoll = new Map<string, number>();
  const seenContact = new Map<string, number>();
  records.forEach((rec, i) => {
    const rowNo = i + 2; // header is row 1
    const errors: string[] = [];
    const warnings: string[] = [];
    const isEligible = toBool(rec.isEligible, true);
    const isActive = toBool(rec.isActive, true);
    if (isEligible === undefined) errors.push(`যোগ্যতার মান "${String(rec.isEligible)}" বোঝা যায়নি।`);
    if (isActive === undefined) errors.push(`অবস্থার মান "${String(rec.isActive)}" বোঝা যায়নি।`);
    const ct = String(rec.contactType ?? "").trim().toUpperCase();
    const parsed = studentSchema.safeParse({
      rollNumber: String(rec.rollNumber ?? ""),
      fullName: String(rec.fullName ?? ""),
      contactType: ct === "EMAIL" || ct === "PHONE" ? ct : undefined,
      contactValue: String(rec.contactValue ?? ""),
      batch: String(rec.batch ?? "").trim() || defaultBatch,
      isEligible: isEligible ?? true,
      isActive: isActive ?? true,
      notes: String(rec.notes ?? ""),
    });
    if (!parsed.success) errors.push(...parsed.error.issues.map((x) => x.message));
    const data = parsed.success ? parsed.data : undefined;
    if (data) {
      const prevRoll = seenRoll.get(data.rollNumber);
      if (prevRoll) errors.push(`রোল নম্বর পুনরাবৃত্ত (${prevRoll} নম্বর সারিতেও আছে)।`);
      else seenRoll.set(data.rollNumber, rowNo);
      const prevContact = seenContact.get(data.contactValue);
      if (prevContact) errors.push(`যোগাযোগ পুনরাবৃত্ত (${prevContact} নম্বর সারিতেও আছে)।`);
      else seenContact.set(data.contactValue, rowNo);
      if (data.batch !== defaultBatch) warnings.push(`ব্যাচ "${data.batch}" ${defaultBatch} নয়; এই শিক্ষার্থী ভোট দিতে পারবেন না।`);
    }
    rows.push({ row: rowNo, data, errors, warnings });
  });

  const valid = rows.filter((r) => r.data && r.errors.length === 0);
  if (valid.length) {
    const rolls = valid.map((r) => r.data!.rollNumber);
    const contacts = valid.map((r) => r.data!.contactValue);
    const existing = await query<{ roll_number: string; contact_value: string }>(
      `select roll_number, lower(contact_value) as contact_value from students where roll_number = any($1) or lower(contact_value) = any($2)`,
      [rolls, contacts.map((c) => c.toLowerCase())],
    );
    const existingRoll = new Map(existing.map((e) => [e.roll_number, e.contact_value]));
    const contactOwner = new Map(existing.map((e) => [e.contact_value, e.roll_number]));
    for (const r of valid) {
      const d = r.data!;
      const owner = contactOwner.get(d.contactValue.toLowerCase());
      if (owner && owner !== d.rollNumber) {
        r.errors.push(`এই যোগাযোগ ইতিমধ্যে রোল ${owner}-এ নিবন্ধিত।`);
        continue;
      }
      if (existingRoll.has(d.rollNumber)) {
        r.action = mode === "upsert" ? "update" : "skip";
        if (mode !== "upsert") r.warnings.push("রোল নম্বরটি আগে থেকেই আছে; সারিটি বাদ দেওয়া হবে।");
      } else r.action = "insert";
    }
  }
  const ok = rows.filter((r) => r.errors.length === 0 && r.data);
  return {
    rows,
    summary: {
      total: rows.length,
      valid: ok.length,
      invalid: rows.length - ok.length,
      inserts: ok.filter((r) => r.action === "insert").length,
      updates: ok.filter((r) => r.action === "update").length,
      skips: ok.filter((r) => r.action === "skip").length,
    },
  };
}

/** Commits an import atomically. Refuses if ANY row is invalid (all-or-nothing). */
export async function commitImport(preview: ImportPreview, adminId: string, ipHash: string | null, source: string) {
  if (preview.summary.invalid > 0) throw new AppError("VALIDATION", "ইমপোর্টের আগে সব ত্রুটিপূর্ণ সারি ঠিক করুন।");
  try {
    return await tx(async (c) => {
      let inserted = 0;
      let updated = 0;
      for (const r of preview.rows) {
        const d = r.data!;
        if (r.action === "insert") {
          await query(
            `insert into students (roll_number, full_name, contact_type, contact_value, batch, is_eligible, is_active, notes)
             values ($1, $2, $3, $4, $5, $6, $7, nullif($8, ''))`,
            [d.rollNumber, d.fullName, d.contactType, d.contactValue, d.batch, d.isEligible, d.isActive, d.notes],
            c,
          );
          inserted++;
        } else if (r.action === "update") {
          await query(
            `update students set full_name = $2, contact_type = $3, contact_value = $4, batch = $5, is_eligible = $6, is_active = $7,
                notes = coalesce(nullif($8, ''), notes) where roll_number = $1`,
            [d.rollNumber, d.fullName, d.contactType, d.contactValue, d.batch, d.isEligible, d.isActive, d.notes],
            c,
          );
          updated++;
        }
      }
      await audit({ actorType: "ADMIN", adminId, action: "STUDENT.IMPORTED", entityType: "student", details: { source, inserted, updated, skipped: preview.summary.skips }, ipHash }, c);
      return { inserted, updated, skipped: preview.summary.skips };
    });
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

// ---------------------------------------------------------------------------
// Data quality & export
// ---------------------------------------------------------------------------
export async function dataQualityReport(batch: string) {
  const duplicateContacts = await query<{ contact: string; rolls: string[] }>(
    `select lower(contact_value) as contact, array_agg(roll_number order by roll_number) as rolls
       from students group by lower(contact_value) having count(*) > 1`,
  );
  const otherBatch = await query<{ roll_number: string; full_name: string; batch: string }>(
    `select roll_number, full_name, batch from students where batch <> $1 order by roll_number limit 200`,
    [batch],
  );
  const counts = await one<{ total: number; eligible: number; inactive: number; ineligible: number; dev_seed: number }>(
    `select count(*)::int as total,
            count(*) filter (where is_active and is_eligible and batch = $1)::int as eligible,
            count(*) filter (where not is_active)::int as inactive,
            count(*) filter (where not is_eligible)::int as ineligible,
            count(*) filter (where is_dev_seed)::int as dev_seed
       from students`,
    [batch],
  );
  return { duplicateContacts, otherBatch, counts };
}

function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportStudentsCsv(electionId: string | null, adminId: string, ipHash: string | null, filter: StudentFilter) {
  const { rows } = await listStudents({ ...filter, electionId, page: 1, pageSize: 200 });
  // listStudents caps page size; export everything matching via a loop.
  const all = [...rows];
  for (let page = 2; all.length % 200 === 0 && all.length > 0; page++) {
    const next = await listStudents({ ...filter, electionId, page, pageSize: 200 });
    if (!next.rows.length) break;
    all.push(...next.rows);
  }
  const header = ["roll_number", "full_name", "contact_type", "contact", "batch", "eligible", "active", "voted"];
  const lines = [header.join(",")].concat(
    all.map((s) => [s.roll_number, s.full_name, s.contact_type, s.contact_value, s.batch, s.is_eligible, s.is_active, s.has_voted ? "yes" : "no"].map(csvCell).join(",")),
  );
  await audit({ actorType: "ADMIN", adminId, action: "EXPORT.STUDENTS", entityType: "student", details: { rows: all.length, filter: { q: filter.q ?? "", voted: filter.voted ?? "", status: filter.status ?? "" } }, ipHash });
  return lines.join("\r\n") + "\r\n";
}
