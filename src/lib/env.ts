import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    APP_URL: z.string().url(),
    DATABASE_URL: z.string().min(10),
    DATABASE_SSL: z.enum(["disable", "require", "verify"]),
    DATABASE_CA_CERT: z.string().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    APP_SECRET_PEPPER: z.string().min(32, "APP_SECRET_PEPPER must be at least 32 characters"),
    APP_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
    OTP_PROVIDER: z.enum(["dev", "live"]).default("dev"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMS_HTTP_URL: z.string().url().optional(),
    SMS_HTTP_TOKEN: z.string().optional(),
    SMS_SENDER_ID: z.string().optional(),
    STORAGE_DRIVER: z.enum(["database", "supabase"]).default("database"),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_PHOTO_BUCKET: z.string().default("candidate-photos"),
    SUPABASE_EVIDENCE_BUCKET: z.string().default("correction-evidence"),
    TRUST_PROXY_HEADERS: bool,
  })
  .superRefine((env, ctx) => {
    for (const p of crossChecks(env as unknown as Record<string, string | undefined>)) {
      ctx.addIssue({ code: "custom", path: [p.variable], message: p.problem });
    }
  });

/** Cross-field rules, written against raw strings so they can be reported even when other fields are invalid. */
function crossChecks(env: Record<string, string | undefined>) {
  const out: { variable: string; problem: string }[] = [];
  const add = (variable: string, problem: string) => out.push({ variable, problem });
  const otp = env.OTP_PROVIDER ?? "dev";
  const prod = env.APP_ENV === "production" || env.APP_ENV === "staging";
  if (prod && otp === "dev") add("OTP_PROVIDER", "must be \"live\" in staging/production (the dev OTP outbox is disabled there)");
  if (prod && env.APP_URL && !env.APP_URL.startsWith("https://")) add("APP_URL", "must use HTTPS in staging/production");
  if (prod && env.DATABASE_SSL === "disable") add("DATABASE_SSL", "database TLS is required in staging/production (use require or verify)");
  if (otp === "live" && !env.SMTP_HOST && !env.SMS_HTTP_URL) add("OTP_PROVIDER", "live OTP needs SMTP_* (email) and/or SMS_HTTP_* (phone) settings");
  if (env.SMTP_HOST && !env.SMTP_FROM) add("SMTP_FROM", "is required when SMTP_HOST is set");
  if (env.SMS_HTTP_URL && !env.SMS_HTTP_TOKEN) add("SMS_HTTP_TOKEN", "is required when SMS_HTTP_URL is set");
  if ((env.STORAGE_DRIVER ?? "database") === "supabase" && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    add("SUPABASE_URL", "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for STORAGE_DRIVER=supabase");
  }
  return out;
}

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/**
 * Fills sensible defaults before validation:
 *  - APP_URL from Vercel's production/deployment host when not set
 *  - DATABASE_SSL: "require" for any non-local database host (e.g. Supabase), else "disable";
 *    an explicit ?sslmode=require in DATABASE_URL is honoured too
 */
function withDefaults(raw: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const e: Record<string, string | undefined> = { ...raw };
  for (const k of Object.keys(e)) if (e[k] === "") e[k] = undefined; // blank Vercel fields = unset
  if (!e.APP_URL) {
    const host = e.VERCEL_PROJECT_PRODUCTION_URL ?? e.VERCEL_URL;
    e.APP_URL = host ? `https://${host}` : "http://localhost:3000";
  }
  if (!e.DATABASE_SSL) {
    let local = true;
    try {
      const u = new URL(e.DATABASE_URL ?? "");
      local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
      if (/sslmode=(require|verify-ca|verify-full)/.test(u.search)) local = false;
    } catch {
      /* invalid URL is reported by validation */
    }
    e.DATABASE_SSL = local ? "disable" : "require";
  }
  return e;
}

/** Problems with the configuration, by variable name (never includes values). */
export function configProblems(): { variable: string; problem: string }[] {
  const raw = withDefaults(process.env);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return [];
  const issues = parsed.error.issues.map((i) => ({
    variable: i.path.join(".") || "(general)",
    problem: /received undefined/.test(i.message) ? "is not set" : i.message,
  }));
  // zod skips superRefine while base fields fail; add the cross-field findings too.
  for (const c of crossChecks(raw)) if (!issues.some((i) => i.variable === c.variable && i.problem === c.problem)) issues.push(c);
  return issues;
}

/** Validated server configuration. Throws (without echoing secret values) if misconfigured. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(withDefaults(process.env));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration — ${problems}. Open /api/health for details.`);
  }
  cached = parsed.data;
  return cached;
}

export const isProductionLike = () => ["production", "staging"].includes(env().APP_ENV);

/** Test hook */
export function resetEnvCache() {
  cached = null;
}
