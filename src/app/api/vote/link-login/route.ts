import { z } from "zod";
import { route, ok, parseJson, requestContext } from "@/lib/http";
import { redeemAccessLink } from "@/lib/services/access-links";
import { setVoterCookie } from "@/lib/session";

export const POST = route(async (req) => {
  const { token, roll } = await parseJson(req, z.object({ token: z.string().max(100), roll: z.string().max(40) }));
  const { token: session, expiresAt } = await redeemAccessLink(token, roll, requestContext(req));
  const res = ok({ next: "/vote/ballot" });
  setVoterCookie(res, session, new Date(expiresAt));
  return res;
});
