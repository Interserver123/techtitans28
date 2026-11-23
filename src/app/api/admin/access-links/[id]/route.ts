import { adminRoute } from "@/lib/admin-route";
import { ok } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { revokeAccessLink } from "@/lib/services/access-links";

export const DELETE = adminRoute<{ id: string }>("students.write", async (_req, { admin, c, params }) => {
  await revokeAccessLink(assertUuid(params.id), admin.adminId, c.ipHash);
  return ok();
});
