import { route, ok, parseJson, requestContext } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { getCurrentElection } from "@/lib/services/elections";
import { demoAvailable, demoRollSchema, lookupDemoVoter } from "@/lib/services/demo";

export const POST = route(async (req) => {
  if (!demoAvailable(await getCurrentElection())) throw new AppError("ELECTION_CLOSED");
  const { roll } = await parseJson(req, demoRollSchema);
  return ok(await lookupDemoVoter(roll, requestContext(req)));
});
