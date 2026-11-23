import { bn as bnDigits } from "../format";
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
      subject: "টেকটাইটানস-২৮ সিআর নির্বাচন: আপনার যাচাই কোড",
      text: [
        `প্রিয় ${msg.studentName},`,
        "",
        `আপনার এককালীন যাচাই কোড: ${msg.code}`,
        `কোডটি ${bnDigits(msg.ttlMinutes)} মিনিট পর মেয়াদোত্তীর্ণ হবে এবং একবারই ব্যবহার করা যাবে।`,
        "",
        "এই কোড কখনো কাউকে দেবেন না। নির্বাচন কমিটির কেউ কখনো এটি চাইবেন না।",
        "আপনি এই কোড না চেয়ে থাকলে এখনই নির্বাচন কমিটিকে জানান।",
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
        // Bengali SMS is sent as Unicode (70 characters per segment); this stays within one segment.
        message: `সিআর নির্বাচনের কোড: ${msg.code}। মেয়াদ ${bnDigits(msg.ttlMinutes)} মিনিট। কাউকে দেবেন না।`,
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
