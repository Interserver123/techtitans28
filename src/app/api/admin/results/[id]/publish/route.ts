import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { publishResults } from "@/lib/services/results";

export const POST = adminRoute<{ id: string }>("results.publish", async (req, { admin, c, params }) => {
  const { note, confirm } = await parseJson(req, z.object({ note: z.string().trim().max(2000).default(""), confirm: z.literal("PUBLISH") }));
  void confirm;
  await publishResults(assertUuid(params.id), admin.adminId, note, c.ipHash);
  return ok();
});
