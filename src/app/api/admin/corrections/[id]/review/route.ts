import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { reviewCorrection } from "@/lib/services/corrections";

export const POST = adminRoute<{ id: string }>("corrections.review", async (req, { admin, c, params }) => {
  const { approve, note } = await parseJson(req, z.object({ approve: z.boolean(), note: z.string().trim().min(5, "পর্যালোচনার নোট লিখুন।").max(2000) }));
  const status = await reviewCorrection(assertUuid(params.id), approve, note, admin.adminId, c.ipHash);
  return ok({ status });
}, { stepUp: true });
