import "server-only";
import nodemailer from "nodemailer";
import { env, isProductionLike } from "../env";
import { bn as bnDigits } from "../format";

export type OtpMessage = { contactType: "EMAIL" | "PHONE"; to: string; code: string; studentName: string; ttlMinutes: number; demo?: boolean };

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

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The verification email: Bengali first with an English line, plain-text twin for every client. */
export function otpEmail(msg: Pick<OtpMessage, "code" | "studentName" | "ttlMinutes" | "demo">) {
  const mins = bnDigits(msg.ttlMinutes);
  const subject = `${msg.demo ? "[ডেমো] " : ""}${msg.code} — টেকটাইটানস-২৮ সিআর নির্বাচনের যাচাই কোড`;
  const demoNote = "এটি ডেমো ভোটের কোড — এতে কোনো ভোট গণনা হয় না। (Demo code: no vote is counted.)";
  const text = [
    `প্রিয় ${msg.studentName},`,
    ...(msg.demo ? ["", demoNote] : []),
    "",
    `আপনার এককালীন যাচাই কোড: ${msg.code}`,
    `কোডটি ${mins} মিনিট পর মেয়াদোত্তীর্ণ হবে এবং একবারই ব্যবহার করা যাবে।`,
    "",
    "এই কোড কখনো কাউকে দেবেন না। নির্বাচন কমিটির কেউ কখনো এটি চাইবেন না।",
    "আপনি এই কোড না চেয়ে থাকলে এখনই নির্বাচন কমিটিকে জানান।",
    "",
    `Your one-time code for the TechTitans-28 CR election is ${msg.code}. It expires in ${msg.ttlMinutes} minutes. Never share it.`,
  ].join("\n");
  const digits = msg.code.split("").map((d) => `<span style="display:inline-block;min-width:34px;margin:0 3px;padding:10px 0;border-radius:10px;background:#ffffff;border:1px solid #e6cd8a;font:700 26px/1 'Courier New',monospace;color:#08140f;text-align:center">${esc(d)}</span>`).join("");
  const html = `<!doctype html><html lang="bn"><body style="margin:0;background:#f7f8f4;padding:24px 12px;font-family:'Noto Sans Bengali','Hind Siliguri',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;border-collapse:collapse">
<tr><td style="background:#06281c;border-radius:18px 18px 0 0;padding:22px 26px;color:#ffffff">
<div style="font-size:12px;letter-spacing:.5px;color:#e6cd8a">ইসলামী বিশ্ববিদ্যালয় · আইসিটি</div>
<div style="font-size:20px;font-weight:700;margin-top:4px">টেকটাইটানস-২৮ সিআর নির্বাচন</div>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #ece4cf;border-top:0;border-radius:0 0 18px 18px;padding:26px">
<p style="margin:0 0 6px;font-size:15px">প্রিয় ${esc(msg.studentName)},</p>
${msg.demo ? `<p style="margin:0 0 12px;padding:10px 12px;border-radius:10px;background:#fff7e0;color:#8a6a22;font-size:13px">${esc(demoNote)}</p>` : ""}<p style="margin:0 0 18px;font-size:15px;line-height:1.7">ভোট দিতে নিচের এককালীন যাচাই কোডটি লিখুন।</p>
<div style="text-align:center;background:#fbf6e8;border-radius:14px;padding:18px 8px">${digits}</div>
<p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#475569">কোডটি <b>${mins} মিনিট</b> পর মেয়াদোত্তীর্ণ হবে এবং একবারই ব্যবহার করা যাবে।<br>এই কোড কখনো কাউকে দেবেন না — নির্বাচন কমিটির কেউ কখনো এটি চাইবেন না।<br>আপনি এই কোড না চেয়ে থাকলে এখনই নির্বাচন কমিটিকে জানান।</p>
<p lang="en" style="margin:16px 0 0;padding-top:14px;border-top:1px solid #eef0ea;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#64748b">Your one-time code for the TechTitans-28 CR election is <b>${esc(msg.code)}</b>. It expires in ${msg.ttlMinutes} minutes and works once. Never share it.</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

function smtpTransport() {
  const e = env();
  const port = e.SMTP_PORT ?? 587;
  return nodemailer.createTransport({
    host: e.SMTP_HOST,
    port,
    secure: port === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    requireTLS: port !== 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

const smtpProvider: OtpProvider = {
  name: "smtp",
  async send(msg) {
    if (msg.contactType !== "EMAIL") throw new Error("SMTP provider can only deliver to email contacts");
    await smtpTransport().sendMail({ from: env().SMTP_FROM, to: msg.to, ...otpEmail(msg) });
  },
};

/** Which delivery channels are switched on. Reports no addresses, users or passwords. */
export function otpStatus() {
  const mode = process.env.OTP_PROVIDER === "live" ? "live" : "dev";
  return { mode, email: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM), sms: Boolean(process.env.SMS_HTTP_URL) };
}

/** Turns an SMTP failure into a hint an administrator can act on (never echoes credentials). */
export function smtpProblem(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; command?: string; message?: string };
  if (e.code === "EAUTH" || e.responseCode === 535 || e.responseCode === 534)
    return "ইমেইল সার্ভারে লগইন ব্যর্থ হয়েছে। SMTP_USER ও SMTP_PASS যাচাই করুন (Gmail হলে সাধারণ পাসওয়ার্ড নয়, ১৬ অক্ষরের App Password লাগবে)।";
  if (e.code === "ESOCKET" || e.code === "ECONNECTION" || e.code === "ETIMEDOUT" || e.code === "EDNS")
    return "ইমেইল সার্ভারে সংযোগ করা যায়নি। SMTP_HOST ও SMTP_PORT (465 বা 587) যাচাই করুন।";
  if (e.code === "EENVELOPE" || e.responseCode === 550 || e.responseCode === 553)
    return "প্রেরক বা প্রাপকের ঠিকানা গ্রহণ করা হয়নি। SMTP_FROM-এ সেই ইমেইল ঠিকানা দিন, যেটি দিয়ে লগইন করছেন।";
  return `ইমেইল পাঠানো যায়নি (${e.code ?? e.responseCode ?? "অজানা ত্রুটি"})।`;
}

/** Sends a sample verification email (code 000000) so administrators can confirm delivery before voting. */
export async function sendTestEmail(to: string) {
  const s = otpStatus();
  if (s.mode !== "live" || !s.email) throw new Error("EMAIL_NOT_CONFIGURED");
  const mail = otpEmail({ code: "000000", studentName: "পরীক্ষামূলক প্রাপক", ttlMinutes: 5 });
  await smtpTransport().sendMail({ from: env().SMTP_FROM, to, subject: `[পরীক্ষা] ${mail.subject}`, text: mail.text, html: mail.html });
}

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
