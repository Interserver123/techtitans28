import { after } from "next/server";
import { route, ok, parseJson, requestContext } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { getCurrentElection } from "@/lib/services/elections";
import { demoAvailable, demoRollSchema, requestDemoCode } from "@/lib/services/demo";

export const POST = route(async (req) => {
  if (!demoAvailable(await getCurrentElection())) throw new AppError("ELECTION_CLOSED");
  const { roll } = await parseJson(req, demoRollSchema);
  const { token, maskedContact, deliver } = await requestDemoCode(roll, requestContext(req));
  after(async () => {
    try { await deliver(); } catch (err) { console.error("demo code delivery failed", (err as { code?: string }).code ?? err); }
  });
  return ok({ token, maskedContact });
});
