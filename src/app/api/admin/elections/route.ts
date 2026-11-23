import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { createElection, electionInputSchema } from "@/lib/services/elections";

export const POST = adminRoute("elections.configure", async (req, { admin, c }) => {
  const input = await parseJson(req, electionInputSchema);
  const id = await createElection(input, admin.adminId, c.ipHash);
  return ok({ id });
});
