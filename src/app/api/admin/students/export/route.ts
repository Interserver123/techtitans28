import { adminRoute } from "@/lib/admin-route";
import { exportStudentsCsv } from "@/lib/services/students";
import { getAdminElections } from "@/lib/admin-context";

export const GET = adminRoute("students.export", async (req, { admin, c }) => {
  const sp = req.nextUrl.searchParams;
  const { selected } = await getAdminElections();
  const csv = await exportStudentsCsv(selected?.id ?? null, admin.adminId, c.ipHash, {
    q: sp.get("q") ?? undefined,
    voted: (sp.get("voted") as "yes" | "no" | "") ?? "",
    status: (sp.get("status") as "active" | "inactive" | "ineligible" | "") ?? "",
  });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="techtitans28-students-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});
