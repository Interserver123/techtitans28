import "server-only";
import { one } from "./db";
import { hmac } from "./crypto";
import { AppError } from "./errors";

/** Fixed-window limiter backed by PostgreSQL so it holds across serverless instances. */
export async function rateLimit(bucket: string, subject: string, limit: number, windowSeconds: number) {
  const key = `${bucket}:${hmac("ratelimit", subject).slice(0, 40)}`;
  const row = await one<{ allowed: boolean }>("select hit_rate_limit($1, $2, $3) as allowed", [key, limit, windowSeconds]);
  return row?.allowed === true;
}

export async function enforceRateLimit(bucket: string, subject: string, limit: number, windowSeconds: number) {
  if (!(await rateLimit(bucket, subject, limit, windowSeconds))) throw new AppError("RATE_LIMITED");
}
