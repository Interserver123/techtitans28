import "server-only";
import { z } from "zod";
import { query, one } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { enforceRateLimit } from "../rate-limit";

export const DISPUTE_CATEGORIES = {
  IDENTITY_MISUSE: "Someone else may have voted using my identity",
  OTP_NOT_RECEIVED: "I did not receive my verification code",
  NOT_ON_REGISTER: "My roll number is not accepted",
  TECHNICAL: "Technical problem while voting",
  OTHER: "Other",
} as const;

export const disputeSchema = z.object({
  rollNumber: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, "Invalid roll number.")]).default(""),
  reporterName: z.string().trim().min(2, "Enter your name.").max(120),
  reporterContact: z.string().trim().min(5, "Enter a phone number or email.").max(254),
  category: z.enum(Object.keys(DISPUTE_CATEGORIES) as [keyof typeof DISPUTE_CATEGORIES, ...(keyof typeof DISPUTE_CATEGORIES)[]]),
  description: z.string().trim().min(10, "Describe the problem (at least 10 characters).").max(3000),
});

/**
 * Records a dispute for the Election Committee. A dispute NEVER grants, resets or
 * re-issues a ballot; resolution is a manual, audited committee decision.
 */
export async function submitDispute(input: z.input<typeof disputeSchema>, electionId: string | null, ip: string | null, ipHash: string | null) {
  const v = disputeSchema.parse(input);
  await enforceRateLimit("dispute-ip", ip ?? "unknown", 5, 60 * 60);
  const ref = (await one<{ r: string }>(`select 'D-' || random_code(8) as r`))!.r;
  const row = await one<{ id: string }>(
    `insert into disputes (reference, election_id, roll_number, reporter_name, reporter_contact, category, description)
     values ($1, $2, nullif($3, ''), $4, $5, $6, $7) returning id`,
    [ref, electionId, v.rollNumber, v.reporterName, v.reporterContact, v.category, v.description],
  );
  await audit({ actorType: "PUBLIC", action: "DISPUTE.SUBMITTED", entityType: "dispute", entityId: row!.id, details: { reference: ref, category: v.category }, ipHash });
  return ref;
}

export async function listDisputes(status?: string) {
  return query<{
    id: string; reference: string; roll_number: string | null; reporter_name: string; reporter_contact: string; category: string;
    description: string; status: string; resolution_note: string | null; handled_by_name: string | null; created_at: Date; updated_at: Date;
    student_name: string | null; has_voted: boolean | null;
  }>(
    `select d.*, a.full_name as handled_by_name, s.full_name as student_name,
            case when s.id is null then null else exists (select 1 from voter_participation p where p.student_id = s.id and p.election_id = d.election_id) end as has_voted
       from disputes d
       left join election_admins a on a.id = d.handled_by
       left join students s on s.roll_number = d.roll_number
      where ($1::text is null or d.status = $1)
      order by (d.status in ('OPEN','UNDER_REVIEW')) desc, d.created_at desc limit 300`,
    [status || null],
  );
}

export const disputeUpdateSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "RESOLVED", "REJECTED"]),
  resolutionNote: z.string().trim().min(5, "Add a note describing the decision.").max(3000),
});

export async function updateDispute(id: string, input: z.input<typeof disputeUpdateSchema>, adminId: string, ipHash: string | null) {
  const v = disputeUpdateSchema.parse(input);
  const r = await one<{ reference: string }>(
    `update disputes set status = $2, resolution_note = $3, handled_by = $4 where id = $1 returning reference`,
    [id, v.status, v.resolutionNote, adminId],
  );
  if (!r) throw new AppError("NOT_FOUND");
  await audit({ actorType: "ADMIN", adminId, action: "DISPUTE.UPDATED", entityType: "dispute", entityId: id, details: { reference: r.reference, status: v.status, note: v.resolutionNote }, ipHash });
}
