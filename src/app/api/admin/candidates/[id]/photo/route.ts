import { adminRoute, readForm, fileBytes } from "@/lib/admin-route";
import { ok } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { setCandidatePhoto } from "@/lib/services/candidates";

export const POST = adminRoute<{ id: string }>("candidates.write", async (req, { admin, c, params }) => {
  const form = await readForm(req, 4 * 1024 * 1024);
  const bytes = await fileBytes(form.get("photo"));
  if (!bytes) throw new AppError("VALIDATION", "Choose an image to upload.");
  const url = await setCandidatePhoto(assertUuid(params.id), bytes, admin.adminId, c.ipHash);
  return ok({ url });
});
