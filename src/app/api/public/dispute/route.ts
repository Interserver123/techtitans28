import { route, ok, parseJson, requestContext } from "@/lib/http";
import { disputeSchema, submitDispute } from "@/lib/services/disputes";
import { getCurrentElection } from "@/lib/services/elections";

export const POST = route(async (req) => {
  const input = await parseJson(req, disputeSchema);
  const c = requestContext(req);
  const e = await getCurrentElection();
  const reference = await submitDispute(input, e?.id ?? null, c.ip, c.ipHash);
  return ok({ reference });
});
