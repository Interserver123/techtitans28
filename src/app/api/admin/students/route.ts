import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { createStudent, studentSchema } from "@/lib/services/students";

export const POST = adminRoute("students.write", async (req, { admin, c }) => {
  const input = await parseJson(req, studentSchema);
  const id = await createStudent(input, admin.adminId, c.ipHash);
  return ok({ id });
});
