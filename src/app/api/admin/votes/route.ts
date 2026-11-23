import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { changeVote, changeVoteSchema } from "@/lib/services/vote-records";

/** Super Admin only (also re-checked inside the database function). */
export const PATCH = adminRoute("admins.manage", async (req, { admin, c }) => {
  if (admin.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN");
  await changeVote(admin.adminId, await parseJson(req, changeVoteSchema), c.ipHash);
  return ok();
});
