import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { deleteDraftElection, electionInputSchema, updateElection } from "@/lib/services/elections";

export const PATCH = adminRoute<{ id: string }>("elections.configure", async (req, { admin, c, params }) => {
  const input = await parseJson(req, electionInputSchema);
  await updateElection(assertUuid(params.id), input, admin.adminId, c.ipHash);
  return ok();
});

export const DELETE = adminRoute<{ id: string }>("elections.configure", async (_req, { admin, c, params }) => {
  await deleteDraftElection(assertUuid(params.id), admin.adminId, c.ipHash);
  return ok();
});
