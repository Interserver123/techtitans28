import { route, ok, parseJson } from "@/lib/http";
import { castSchema, castVote } from "@/lib/services/voting";
import { voterToken } from "@/lib/session";

export const POST = route(async (req) => {
  const { candidateId } = await parseJson(req, castSchema);
  const receipt = await castVote(voterToken(req), candidateId);
  return ok({ receiptCode: receipt.receiptCode, votedAt: receipt.votedAt });
});
