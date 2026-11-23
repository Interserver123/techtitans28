import { adminRoute, readForm, fileBytes } from "@/lib/admin-route";
import { ok } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { commitImport, parseImportFile, previewImport } from "@/lib/services/students";
import { getPublicSettings } from "@/lib/services/settings";

/**
 * multipart: file, mode (insert_only|upsert), commit ("true" to write).
 * The file is re-parsed and re-validated on commit — the client's preview is never trusted.
 */
export const POST = adminRoute("students.import", async (req, { admin, c }) => {
  const form = await readForm(req, 3 * 1024 * 1024);
  const file = form.get("file");
  const bytes = await fileBytes(file);
  if (!bytes || typeof file === "string" || !file) throw new AppError("VALIDATION", "একটি .csv বা .xlsx ফাইল বেছে নিন।");
  const mode = form.get("mode") === "upsert" ? "upsert" : "insert_only";
  const records = await parseImportFile(file.name, bytes);
  const { batch } = await getPublicSettings();
  const preview = await previewImport(records, batch, mode);
  const rows = preview.rows.map((r) => ({
    row: r.row, errors: r.errors, warnings: r.warnings, action: r.action ?? null,
    rollNumber: r.data?.rollNumber ?? null, fullName: r.data?.fullName ?? null, contactType: r.data?.contactType ?? null, batch: r.data?.batch ?? null,
  }));
  if (form.get("commit") !== "true") return ok({ summary: preview.summary, rows });
  const result = await commitImport(preview, admin.adminId, c.ipHash, file.name.slice(0, 120));
  return ok({ summary: preview.summary, rows, committed: result });
});
