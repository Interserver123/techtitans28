import { route, ok, parseJson } from "@/lib/http";
import { demoVerifySchema, verifyDemoCode } from "@/lib/services/demo";

export const POST = route(async (req) => {
  const { token, code } = await parseJson(req, demoVerifySchema);
  return ok(await verifyDemoCode(token, code));
});
