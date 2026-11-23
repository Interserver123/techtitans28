import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { transitionElection } from "@/lib/services/elections";

const schema = z.object({ action: z.enum(["schedule", "unschedule", "open", "pause", "resume", "close"]), reason: z.string().trim().max(500).optional() });

export const POST = adminRoute<{ id: string }>("elections.control", async (req, { admin, c, params }) => {
  const { action, reason } = await parseJson(req, schema);
  const status = await transitionElection(assertUuid(params.id), action, admin.adminId, c.ipHash, reason);
  return ok({ status });
});
