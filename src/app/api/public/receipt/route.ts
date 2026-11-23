import { z } from "zod";
import { route, ok, parseJson, requestContext } from "@/lib/http";
import { verifyReceipt } from "@/lib/services/voting";

export const POST = route(async (req) => {
  const { code } = await parseJson(req, z.object({ code: z.string().max(40) }));
  const r = await verifyReceipt(code, requestContext(req).ip);
  return ok(r ? { found: true, electionTitle: r.election_title, votedAt: r.voted_at } : { found: false });
});
