import { after } from "next/server";
import { route, ok, parseJson, requestContext } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { getCurrentElection } from "@/lib/services/elections";
import { demoAvailable, demoEmailSchema, requestDemoCode } from "@/lib/services/demo";

export const POST = route(async (req) => {
  if (!demoAvailable(await getCurrentElection())) throw new AppError("ELECTION_CLOSED");
  const { email } = await parseJson(req, demoEmailSchema);
  const { token, deliver } = await requestDemoCode(email, requestContext(req));
  after(async () => {
    try { await deliver(); } catch (err) { console.error("demo code delivery failed", (err as { code?: string }).code ?? err); }
  });
  return ok({ token });
});
