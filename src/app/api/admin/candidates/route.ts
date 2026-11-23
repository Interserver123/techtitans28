import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { candidateSchema, createCandidate } from "@/lib/services/candidates";

export const POST = adminRoute("candidates.write", async (req, { admin, c }) => {
  const body = await parseJson(req, candidateSchema.extend({ electionId: z.string().uuid() }));
  const id = await createCandidate(body.electionId, body, admin.adminId, c.ipHash);
  return ok({ id });
});
