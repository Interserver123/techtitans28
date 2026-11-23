import "server-only";
import { z } from "zod";
import { hmac, numericOtp, randomToken, safeEqual } from "../crypto";
import { AppError } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import { otpProvider } from "../otp/provider";
import type { RequestContext } from "../http";
import type { Election } from "./elections";

/**
 * Demo vote: lets anyone try the real flow (email code → ballot → receipt) without touching the
 * election. Nothing is stored except rate-limit counters: the code is checked against a signed,
 * short-lived token, and the "ballot" never leaves the browser.
 */
const TTL_SECONDS = 5 * 60;

export const demoEmailSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254) });
export const demoVerifySchema = z.object({ token: z.string().max(400), code: z.string().trim().max(10) });

/** The demo switches itself off once voting has closed. */
export const demoAvailable = (e: Pick<Election, "status"> | null) => !e || !["CLOSED", "RESULTS_PUBLISHED"].includes(e.status);

const sign = (payload: string) => hmac("demo-token", payload);

export async function requestDemoCode(email: string, ctx: RequestContext) {
  // Strict limits: this endpoint sends real email to an address the visitor types.
  await enforceRateLimit("demo-ip", ctx.ipHash ?? "unknown", 3, 3600);
  await enforceRateLimit("demo-email", email, 3, 86400);
  await enforceRateLimit("demo-global", "all", 40, 86400);
  const code = numericOtp(6);
  const nonce = randomToken(12);
  const payload = Buffer.from(JSON.stringify({ n: nonce, x: Math.floor(Date.now() / 1000) + TTL_SECONDS, h: hmac("demo-code", `${nonce}:${code}`) })).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  const deliver = () => otpProvider().send({ contactType: "EMAIL", to: email, code, studentName: "ডেমো ব্যবহারকারী", ttlMinutes: TTL_SECONDS / 60, demo: true });
  return { token, deliver };
}

export async function verifyDemoCode(token: string, code: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) throw new AppError("INVALID_OTP");
  let data: { n: string; x: number; h: string };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new AppError("INVALID_OTP");
  }
  await enforceRateLimit("demo-verify", data.n, 5, TTL_SECONDS);
  if (data.x < Date.now() / 1000) throw new AppError("INVALID_OTP");
  if (!/^[0-9]{6}$/.test(code) || !safeEqual(data.h, hmac("demo-code", `${data.n}:${code}`))) throw new AppError("INVALID_OTP");
  return { receipt: `DEMO-${randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 8)}` };
}
