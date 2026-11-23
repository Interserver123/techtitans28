import { adminRoute, readForm, fileBytes } from "@/lib/admin-route";
import { ok } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { createCorrection } from "@/lib/services/corrections";

export const POST = adminRoute("corrections.create", async (req, { admin, c }) => {
  const form = await readForm(req, 6 * 1024 * 1024);
  const id = await createCorrection(
    assertUuid(String(form.get("electionId") ?? "")),
    {
      ballotRef: String(form.get("ballotRef") ?? ""),
      correction: String(form.get("correction") ?? "") as "INVALIDATE_BALLOT",
      reason: String(form.get("reason") ?? ""),
      evidenceNote: String(form.get("evidenceNote") ?? ""),
    },
    await fileBytes(form.get("evidence")),
    admin.adminId,
    c.ipHash,
  );
  return ok({ id });
}, { stepUp: true });
