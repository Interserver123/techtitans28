import { z } from "zod";
import { route, ok, parseJson, requestContext } from "@/lib/http";
import { verifyOtp } from "@/lib/services/voter-auth";
import { OTP_CHALLENGE_COOKIE, clearCookie, setVoterCookie } from "@/lib/session";

export const POST = route(async (req) => {
  const { code } = await parseJson(req, z.object({ code: z.string().max(10) }));
  const { token, expiresAt } = await verifyOtp(req.cookies.get(OTP_CHALLENGE_COOKIE)?.value, code, requestContext(req));
  const res = ok({ next: "/vote/ballot" });
  setVoterCookie(res, token, new Date(expiresAt));
  clearCookie(res, OTP_CHALLENGE_COOKIE);
  return res;
});
