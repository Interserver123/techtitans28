import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendTestEmail, smtpProblem } from "@/lib/otp/provider";

const schema = z.object({ to: z.string().trim().toLowerCase().email("সঠিক ইমেইল ঠিকানা লিখুন।").max(254) });
const mask = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, "$1***$2");

/** Sends a sample verification email so the committee can confirm delivery before voting opens. */
export const POST = adminRoute("settings.manage", async (req, { admin, c }) => {
  const { to } = await parseJson(req, schema);
  await enforceRateLimit("admin-test-email", admin.adminId, 5, 600);
  try {
    await sendTestEmail(to);
  } catch (err) {
    const notConfigured = err instanceof Error && err.message === "EMAIL_NOT_CONFIGURED";
    await audit({ actorType: "ADMIN", adminId: admin.adminId, action: "SETTINGS.TEST_EMAIL_FAILED", entityType: "settings", details: { to: mask(to), reason: notConfigured ? "not_configured" : (err as { code?: string }).code ?? "smtp_error" }, ipHash: c.ipHash });
    throw new AppError("BAD_REQUEST", notConfigured
      ? "ইমেইল পাঠানো এখনো চালু হয়নি। Vercel-এ OTP_PROVIDER=live এবং SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM সেট করে আবার ডিপ্লয় করুন।"
      : smtpProblem(err));
  }
  await audit({ actorType: "ADMIN", adminId: admin.adminId, action: "SETTINGS.TEST_EMAIL_SENT", entityType: "settings", details: { to: mask(to) }, ipHash: c.ipHash });
  return ok();
});
