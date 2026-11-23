import { route, ok } from "@/lib/http";
import { getVoterSession } from "@/lib/services/voter-auth";
import { voterToken } from "@/lib/session";
import { AppError } from "@/lib/errors";

export const GET = route(async (req) => {
  const s = await getVoterSession(voterToken(req));
  if (!s) throw new AppError("SESSION_INVALID");
  return ok({ hasVoted: s.hasVoted, receiptCode: s.receiptCode, votedAt: s.votedAt, expiresAt: s.expiresAt });
});
