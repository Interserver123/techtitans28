import "server-only";
import nodemailer from "nodemailer";
import { env, isProductionLike } from "../env";

export type OtpMessage = { contactType: "EMAIL" | "PHONE"; to: string; code: string; studentName: string; ttlMinutes: number };

export interface OtpProvider {
  name: string;
  send(msg: OtpMessage): Promise<void>;
}

// ---------------------------------------------------------------------------
// Development outbox: keeps the last messages in process memory so a developer
// (or the e2e test-suite) can read them at /dev/outbox. Never logged, never
// persisted, refused in staging/production by env validation.
// ---------------------------------------------------------------------------
type OutboxEntry = { to: string; code: string; at: string };
declare global {
  var __ttOutbox: OutboxEntry[] | undefined;
}
export function devOutbox(): OutboxEntry[] {
  if (isProductionLike()) return [];
  return (globalThis.__ttOutbox ??= []);
}

const devProvider: OtpProvider = {
  name: "dev",
  async send(msg) {
    if (isProductionLike()) throw new Error("dev OTP provider disabled");
    const box = devOutbox();
    box.unshift({ to: msg.to, code: msg.code, at: new Date().toISOString() });
    box.splice(50);
  },
};

const smtpProvider: OtpProvider = {
  name: "smtp",
  async send(msg) {
    if (msg.contactType !== "EMAIL") throw new Error("SMTP provider can only deliver to email contacts");
    const e = env();
    const transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 587,
      secure: (e.SMTP_PORT ?? 587) === 465,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
      requireTLS: (e.SMTP_PORT ?? 587) !== 465,
    });
    await transport.sendMail({
      from: e.SMTP_FROM,
      to: msg.to,
      subject: "Your TechTitans-28 CR Election verification code",
      text: [
        `Hello ${msg.studentName},`,
        "",
        `Your one-time verification code is: ${msg.code}`,
        `It expires in ${msg.ttlMinutes} minutes and can be used once.`,
        "",
        "Never share this code. The Election Committee will never ask for it.",
        "If you did not request this code, report it to the Election Committee immediately.",
      ].join("\n"),
    });
  },
};

/** Generic HTTPS SMS gateway: POST JSON {to, message, sender} with a bearer token. */
const smsHttpProvider: OtpProvider = {
  name: "sms_http",
  async send(msg) {
    if (msg.contactType !== "PHONE") throw new Error("SMS provider can only deliver to phone contacts");
    const e = env();
    const res = await fetch(e.SMS_HTTP_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${e.SMS_HTTP_TOKEN}` },
      body: JSON.stringify({
        to: msg.to,
        sender: e.SMS_SENDER_ID,
        message: `TechTitans-28 CR Election code: ${msg.code}. Valid ${msg.ttlMinutes} min. Do not share.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`SMS gateway responded ${res.status}`);
  },
};

let override: OtpProvider | null = null;
/** Test hook */
export function setOtpProvider(p: OtpProvider | null) {
  override = p;
}

/**
 * OTP_PROVIDER=dev  → in-memory outbox (development/test only)
 * OTP_PROVIDER=live → EMAIL contacts via SMTP, PHONE contacts via the SMS gateway.
 */
export function otpProvider(): OtpProvider {
  if (override) return override;
  if (env().OTP_PROVIDER === "dev") return devProvider;
  return {
    name: "live",
    async send(msg) {
      const e = env();
      if (msg.contactType === "EMAIL" && e.SMTP_HOST) return smtpProvider.send(msg);
      if (msg.contactType === "PHONE" && e.SMS_HTTP_URL) return smsHttpProvider.send(msg);
      throw new Error(`No OTP channel configured for ${msg.contactType} contacts`);
    },
  };
}
