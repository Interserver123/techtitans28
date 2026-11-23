import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { candidateSchema, deleteCandidate, updateCandidate } from "@/lib/services/candidates";

export const PATCH = adminRoute<{ id: string }>("candidates.write", async (req, { admin, c, params }) => {
  await updateCandidate(assertUuid(params.id), await parseJson(req, candidateSchema), admin.adminId, c.ipHash);
  return ok();
});

export const DELETE = adminRoute<{ id: string }>("candidates.write", async (_req, { admin, c, params }) => {
  await deleteCandidate(assertUuid(params.id), admin.adminId, c.ipHash);
  return ok();
});
