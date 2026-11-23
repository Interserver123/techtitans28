import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { setStudentActive } from "@/lib/services/students";

export const POST = adminRoute<{ id: string }>("students.write", async (req, { admin, c, params }) => {
  const { active } = await parseJson(req, z.object({ active: z.boolean() }));
  await setStudentActive(assertUuid(params.id), active, admin.adminId, c.ipHash);
  return ok();
});
