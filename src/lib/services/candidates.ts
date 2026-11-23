import "server-only";
import { z } from "zod";
import { query, one, tx } from "../db";
import { AppError, fromDbError } from "../errors";
import { audit } from "../audit";
import { photoUrl, processCandidatePhoto, putObject } from "../storage";
import { getPositionIdForGender } from "./elections";

export type AdminCandidate = {
  id: string;
  election_id: string;
  student_id: string;
  roll_number: string;
  student_name: string;
  student_batch: string;
  gender: "MALE" | "FEMALE" | null;
  display_name: string;
  introduction: string;
  manifesto: string;
  photo_path: string | null;
  photo_url: string | null;
  status: "PENDING" | "APPROVED" | "INACTIVE";
  display_order: number;
  updated_at: Date;
};

export const candidateSchema = z.object({
  rollNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, "প্রার্থীর রোল নম্বর লিখুন।"),
  displayName: z.string().trim().min(2).max(120),
  introduction: z.string().trim().max(600).default(""),
  manifesto: z.string().trim().max(6000).default(""),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export async function listCandidates(electionId: string): Promise<AdminCandidate[]> {
  const rows = await query<Omit<AdminCandidate, "photo_url">>(
    `select c.id, c.election_id, c.student_id, s.roll_number, s.full_name as student_name, s.batch as student_batch,
            to_jsonb(s)->>'gender' as gender, c.display_name, c.introduction, c.manifesto, c.photo_path, c.status, c.display_order, c.updated_at
       from candidates c join students s on s.id = c.student_id join election_positions p on p.id = c.position_id
      where c.election_id = $1 order by p.display_order, c.display_order, c.display_name`,
    [electionId],
  );
  return rows.map((r) => ({ ...r, photo_url: photoUrl(r.photo_path) }));
}

async function resolveCandidateStudent(rollNumber: string, c: Parameters<typeof query>[2]) {
  const s = await one<{ id: string; is_active: boolean; is_eligible: boolean; batch: string; ok_batch: boolean; gender: "MALE" | "FEMALE" | null }>(
    `select id, is_active, is_eligible, batch, gender, batch = setting_text('election.batch', 'TechTitans-28') as ok_batch from students where roll_number = $1`,
    [rollNumber],
    c,
  );
  if (!s) throw new AppError("VALIDATION", "তালিকায় এই রোল নম্বরের কোনো শিক্ষার্থী নেই।");
  if (!s.is_active || !s.is_eligible || !s.ok_batch) throw new AppError("VALIDATION", "প্রার্থীকে অবশ্যই এই ব্যাচের সক্রিয় ও যোগ্য সদস্য হতে হবে।");
  if (!s.gender) throw new AppError("VALIDATION", "এই শিক্ষার্থীর লিঙ্গ (ছাত্র/ছাত্রী) নির্ধারিত নেই। আগে শিক্ষার্থী তালিকায় লিঙ্গ নির্ধারণ করুন — সেটিই ঠিক করে সে ছাত্র সিআর না ছাত্রী সিআর পদে প্রার্থী হবে।");
  return { id: s.id, gender: s.gender };
}

export async function createCandidate(electionId: string, input: z.input<typeof candidateSchema>, adminId: string, ipHash: string | null) {
  const v = candidateSchema.parse(input);
  try {
    return await tx(async (c) => {
      const student = await resolveCandidateStudent(v.rollNumber, c);
      const studentId = student.id;
      const positionId = await getPositionIdForGender(electionId, student.gender, c);
      const row = await one<{ id: string }>(
        `insert into candidates (election_id, position_id, student_id, display_name, introduction, manifesto, display_order, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [electionId, positionId, studentId, v.displayName, v.introduction, v.manifesto, v.displayOrder, adminId],
        c,
      );
      await audit({ actorType: "ADMIN", adminId, action: "CANDIDATE.CREATED", entityType: "candidate", entityId: row!.id, details: { election_id: electionId, roll_number: v.rollNumber, display_name: v.displayName }, ipHash }, c);
      return row!.id;
    });
  } catch (e) {
    const m = fromDbError(e);
    if (m?.code === "CONFLICT" && (m.details as { constraint?: string })?.constraint?.includes("position_id_student_id")) {
      throw new AppError("CONFLICT", "এই শিক্ষার্থী ইতিমধ্যে এই নির্বাচনের প্রার্থী।");
    }
    throw m ?? e;
  }
}

export async function updateCandidate(id: string, input: z.input<typeof candidateSchema>, adminId: string, ipHash: string | null) {
  const v = candidateSchema.parse(input);
  try {
    await tx(async (c) => {
      const before = await one<{ election_id: string; display_name: string; student_id: string }>(
        `select election_id, display_name, student_id from candidates where id = $1 for update`, [id], c);
      if (!before) throw new AppError("NOT_FOUND");
      const student = await resolveCandidateStudent(v.rollNumber, c);
      const studentId = student.id;
      const positionId = await getPositionIdForGender(before.election_id, student.gender, c);
      await query(
        `update candidates set student_id = $2, position_id = $3, display_name = $4, introduction = $5, manifesto = $6, display_order = $7 where id = $1`,
        [id, studentId, positionId, v.displayName, v.introduction, v.manifesto, v.displayOrder],
        c,
      );
      await audit({
        actorType: "ADMIN", adminId, action: "CANDIDATE.UPDATED", entityType: "candidate", entityId: id,
        details: { before: { display_name: before.display_name, student_id: before.student_id }, after: { display_name: v.displayName, student_id: studentId } }, ipHash,
      }, c);
    });
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

export async function setCandidateStatus(id: string, status: "APPROVED" | "INACTIVE" | "PENDING", adminId: string, ipHash: string | null) {
  try {
    await tx(async (c) => {
      const r = await one<{ display_name: string; status: string }>(
        `update candidates c set status = $2 from candidates old where c.id = $1 and old.id = c.id returning c.display_name, old.status`,
        [id, status],
        c,
      );
      if (!r) throw new AppError("NOT_FOUND");
      await audit({ actorType: "ADMIN", adminId, action: `CANDIDATE.${status}`, entityType: "candidate", entityId: id, details: { display_name: r.display_name, from: r.status, to: status }, ipHash }, c);
    });
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}

export async function setCandidatePhoto(id: string, bytes: Buffer, adminId: string, ipHash: string | null) {
  const exists = await one<{ status: string }>(
    `select e.status from candidates c join elections e on e.id = c.election_id where c.id = $1`, [id]);
  if (!exists) throw new AppError("NOT_FOUND");
  if (!["DRAFT", "SCHEDULED"].includes(exists.status)) throw new AppError("CANDIDATES_LOCKED");
  const webp = await processCandidatePhoto(bytes);
  const path = await putObject("photo", webp, "image/webp");
  try {
    await tx(async (c) => {
      await query(`update candidates set photo_path = $2 where id = $1`, [id, path], c);
      await audit({ actorType: "ADMIN", adminId, action: "CANDIDATE.PHOTO_UPDATED", entityType: "candidate", entityId: id, details: { path, bytes: webp.length }, ipHash }, c);
    });
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
  return photoUrl(path);
}

export async function deleteCandidate(id: string, adminId: string, ipHash: string | null) {
  try {
    await tx(async (c) => {
      const r = await one<{ display_name: string; election_id: string }>(`delete from candidates where id = $1 returning display_name, election_id`, [id], c);
      if (!r) throw new AppError("NOT_FOUND");
      await audit({ actorType: "ADMIN", adminId, action: "CANDIDATE.DELETED", entityType: "candidate", entityId: id, details: r, ipHash }, c);
    });
  } catch (e) {
    throw fromDbError(e) ?? e;
  }
}
