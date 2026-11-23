import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { setCandidateStatus } from "@/lib/services/candidates";

export const POST = adminRoute<{ id: string }>("candidates.write", async (req, { admin, c, params }) => {
  const { status } = await parseJson(req, z.object({ status: z.enum(["APPROVED", "INACTIVE", "PENDING"]) }));
  await setCandidateStatus(assertUuid(params.id), status, admin.adminId, c.ipHash);
  return ok();
});
