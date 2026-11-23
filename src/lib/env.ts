import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(10),
    DATABASE_SSL: z.enum(["disable", "require", "verify"]).default("disable"),
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
    const prod = env.APP_ENV === "production" || env.APP_ENV === "staging";
    if (prod && env.OTP_PROVIDER === "dev") {
      ctx.addIssue({ code: "custom", path: ["OTP_PROVIDER"], message: "The dev OTP outbox cannot be used in staging/production" });
    }
    if (prod && !env.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use HTTPS in staging/production" });
    }
    if (prod && env.DATABASE_SSL === "disable") {
      ctx.addIssue({ code: "custom", path: ["DATABASE_SSL"], message: "Database TLS is required in staging/production" });
    }
    if (env.OTP_PROVIDER === "live" && !env.SMTP_HOST && !env.SMS_HTTP_URL) {
      ctx.addIssue({ code: "custom", path: ["OTP_PROVIDER"], message: "OTP_PROVIDER=live requires SMTP_* and/or SMS_HTTP_* settings" });
    }
    if (env.SMTP_HOST && !env.SMTP_FROM) {
      ctx.addIssue({ code: "custom", path: ["SMTP_FROM"], message: "SMTP_FROM is required when SMTP_HOST is set" });
    }
    if (env.SMS_HTTP_URL && !env.SMS_HTTP_TOKEN) {
      ctx.addIssue({ code: "custom", path: ["SMS_HTTP_TOKEN"], message: "SMS_HTTP_TOKEN is required when SMS_HTTP_URL is set" });
    }
    if (env.STORAGE_DRIVER === "supabase" && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for STORAGE_DRIVER=supabase" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server configuration. Throws (without echoing secret values) if misconfigured. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration — ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProductionLike = () => ["production", "staging"].includes(env().APP_ENV);

/** Test hook */
export function resetEnvCache() {
  cached = null;
}
