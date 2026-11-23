import { z } from "zod";
import { route, ok, parseJson, requestContext } from "@/lib/http";
import { lookupVoter } from "@/lib/services/voter-auth";

export const POST = route(async (req) => {
  const { roll } = await parseJson(req, z.object({ roll: z.string().max(40) }));
  return ok(await lookupVoter(roll, requestContext(req)));
});
