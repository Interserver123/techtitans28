import { env, isProductionLike } from "@/lib/env";
import { devOutbox } from "@/lib/otp/provider";

/**
 * DEVELOPMENT ONLY: shows OTPs "sent" by the dev provider so the flow can be
 * exercised without SMTP/SMS. Returns 404 unless OTP_PROVIDER=dev outside
 * staging/production (env validation also forbids dev OTP in production).
 */
export async function GET() {
  if (isProductionLike() || env().OTP_PROVIDER !== "dev") return new Response("Not found", { status: 404 });
  return Response.json({ messages: devOutbox() }, { headers: { "cache-control": "no-store" } });
}
