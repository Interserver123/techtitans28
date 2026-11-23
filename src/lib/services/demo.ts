import "server-only";
import { z } from "zod";
import { hmac, numericOtp, randomToken, safeEqual } from "../crypto";
import { AppError } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import { otpProvider, otpStatus } from "../otp/provider";
import { one } from "../db";
import { maskContact } from "../mask";
import { rollSchema } from "./voter-auth";
import type { RequestContext } from "../http";
import type { Election } from "./elections";

/**
 * Demo vote: a voter tries the real flow (roll number → "is this you?" → code to their registered
 * contact → two-page ballot → receipt) without touching the election. Nothing is stored except
 * rate-limit counters: the code is checked against a signed, short-lived token, and the "ballot"
 * never leaves the browser. Works before voting opens, so voters can practise.
 */
const TTL_SECONDS = 5 * 60;

export const demoRollSchema = z.object({ roll: z.string().max(40) });
export const demoVerifySchema = z.object({ token: z.string().max(400), code: z.string().trim().max(10) });

/** The demo switches itself off once voting has closed. */
export const demoAvailable = (e: Pick<Election, "status"> | null) => !e || !["CLOSED", "RESULTS_PUBLISHED"].includes(e.status);

const sign = (payload: string) => hmac("demo-token", payload);

type Voter = { full_name: string; contact_type: "EMAIL" | "PHONE"; contact_value: string };

async function findVoter(rollInput: string) {
  const roll = rollSchema.parse(rollInput);
  const v = await one<Voter>(
    `select full_name, contact_type, contact_value from students
      where roll_number = $1 and is_active and is_eligible and batch = setting_text('election.batch', 'TechTitans-28')`,
    [roll],
  );
  if (!v) throw new AppError("NOT_ELIGIBLE", "This roll number is not on the voter list or is not eligible to vote.");
  return { roll, v };
}

/** Demo step 1: show the voter's name and partly hidden contact, exactly like the real portal. */
export async function lookupDemoVoter(rollInput: string, ctx: RequestContext) {
  await enforceRateLimit("demo-lookup-ip", ctx.ip ?? "unknown", 60, 15 * 60);
  const { roll, v } = await findVoter(rollInput);
  const st = otpStatus();
  const deliverable = st.mode === "dev" || (v.contact_type === "EMAIL" ? st.email : st.sms);
  return { roll, fullName: v.full_name, contactType: v.contact_type, maskedContact: maskContact(v.contact_type, v.contact_value), deliverable };
}

/** Demo step 2: send a demo code to the voter's REGISTERED contact (never to an address the visitor types). */
export async function requestDemoCode(rollInput: string, ctx: RequestContext) {
  await enforceRateLimit("demo-ip", ctx.ipHash ?? "unknown", 10, 3600);
  const { roll, v } = await findVoter(rollInput);
  await enforceRateLimit("demo-roll", roll, 5, 86400);
  await enforceRateLimit("demo-global", "all", 150, 86400);
  const code = numericOtp(6);
  const nonce = randomToken(12);
  const payload = Buffer.from(JSON.stringify({ n: nonce, x: Math.floor(Date.now() / 1000) + TTL_SECONDS, h: hmac("demo-code", `${nonce}:${code}`) })).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  const deliver = () => otpProvider().send({ contactType: v.contact_type, to: v.contact_value, code, studentName: v.full_name, ttlMinutes: TTL_SECONDS / 60, demo: true });
  return { token, maskedContact: maskContact(v.contact_type, v.contact_value), deliver };
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
