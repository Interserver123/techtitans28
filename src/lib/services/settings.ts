import "server-only";
import { z } from "zod";
import { query, one } from "../db";
import { audit } from "../audit";
import { AppError } from "../errors";

export type CommitteeMember = { name: string; designation: string; contact?: string };
export type PublicSettings = {
  batch: string;
  department: string;
  institution: string;
  committee: CommitteeMember[];
  contact: { email: string; phone: string; office: string };
};

export async function getSettingsMap() {
  const rows = await query<{ key: string; value: unknown }>("select key, value from system_settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
}

export async function getNumberSetting(key: string, fallback: number) {
  const row = await one<{ value: unknown }>("select value from system_settings where key = $1", [key]);
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const s = await getSettingsMap();
  const contact = (s["committee.contact"] ?? {}) as Partial<PublicSettings["contact"]>;
  return {
    batch: String(s["election.batch"] ?? "TechTitans-28"),
    department: String(s["election.department"] ?? "Department of Information and Communication Technology"),
    institution: String(s["election.institution"] ?? "Islamic University, Bangladesh"),
    committee: Array.isArray(s["committee.members"]) ? (s["committee.members"] as CommitteeMember[]) : [],
    contact: { email: contact.email ?? "", phone: contact.phone ?? "", office: contact.office ?? "" },
  };
}

export const committeeSchema = z.object({
  committee: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        designation: z.string().trim().min(2).max(120),
        contact: z.string().trim().max(120).optional().default(""),
      }),
    )
    .max(20),
  contact: z.object({
    email: z.union([z.literal(""), z.string().trim().email().max(254)]),
    phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 -]{7,20}$/)]),
    office: z.string().trim().max(200),
  }),
});

export async function updatePublicSettings(input: z.infer<typeof committeeSchema>, adminId: string, ipHash: string | null) {
  const parsed = committeeSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message);
  await query(
    `insert into system_settings (key, value, updated_by) values
       ('committee.members', $1::jsonb, $3), ('committee.contact', $2::jsonb, $3)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(parsed.data.committee), JSON.stringify(parsed.data.contact), adminId],
  );
  await audit({ actorType: "ADMIN", adminId, action: "SETTINGS.UPDATED", entityType: "system_settings", entityId: "committee", details: { members: parsed.data.committee.length }, ipHash });
}
