import { route, ok, parseJson } from "@/lib/http";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { castSchema, castVote } from "@/lib/services/voting";
import { voterToken } from "@/lib/session";

export const POST = route(async (req) => {
  const { candidateIds, openBallotAck } = await parseJson(req, castSchema.extend({ openBallotAck: z.boolean().optional() }));
  // The voter must have seen and accepted the open-ballot notice (an old, cached page cannot submit).
  if (openBallotAck !== true) throw new AppError("BAD_REQUEST", "ভোটের নিয়ম হালনাগাদ হয়েছে। পাতাটি রিফ্রেশ করে নতুন নোটিশটি নিশ্চিত করুন, তারপর আবার জমা দিন। (The voting rules were updated: refresh the page and confirm the new notice.)");
  const receipt = await castVote(voterToken(req), candidateIds);
  return ok({ receiptCode: receipt.receiptCode, votedAt: receipt.votedAt });
});
