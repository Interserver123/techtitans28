import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { studentSchema, updateStudent } from "@/lib/services/students";

export const PATCH = adminRoute<{ id: string }>("students.write", async (req, { admin, c, params }) => {
  const input = await parseJson(req, studentSchema);
  await updateStudent(assertUuid(params.id), input, admin.adminId, c.ipHash);
  return ok();
});
