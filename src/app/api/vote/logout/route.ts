import { route, ok } from "@/lib/http";
import { endVoterSession } from "@/lib/services/voter-auth";
import { VOTER_COOKIE, clearCookie, voterToken } from "@/lib/session";

export const POST = route(async (req) => {
  await endVoterSession(voterToken(req));
  const res = ok();
  clearCookie(res, VOTER_COOKIE);
  return res;
});
