import { after } from "next/server";
import { z } from "zod";
import { route, ok, parseJson, requestContext } from "@/lib/http";
import { requestOtp } from "@/lib/services/voter-auth";
import { setChallengeCookie } from "@/lib/session";

export const POST = route(async (req) => {
  const { roll } = await parseJson(req, z.object({ roll: z.string().max(40) }));
  const { challengeId, deliver } = await requestOtp(roll, requestContext(req));
  // Delivery runs after the response is sent: identical timing for every roll.
  after(deliver);
  const res = ok({
    message: "রোল নম্বরটি নিবন্ধিত ও যোগ্য হলে এর নিবন্ধিত যোগাযোগে ৬ অঙ্কের একটি কোড পাঠানো হয়েছে।",
  });
  setChallengeCookie(res, challengeId);
  return res;
});
