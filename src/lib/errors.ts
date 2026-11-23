/** Error codes are stable API; messages are safe to show to end users. */
export const ERRORS = {
  VALIDATION: [400, "অনুরোধে অবৈধ তথ্য রয়েছে।"],
  BAD_REQUEST: [400, "অনুরোধটি প্রক্রিয়া করা যায়নি।"],
  UNAUTHENTICATED: [401, "চালিয়ে যেতে লগইন করুন।"],
  SESSION_INVALID: [401, "আপনার ভোটদানের সেশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে আবার যাচাই করুন।"],
  MFA_REQUIRED: [401, "দুই-ধাপের যাচাই প্রয়োজন।"],
  INVALID_CREDENTIALS: [401, "ইমেইল বা পাসওয়ার্ড সঠিক নয়।"],
  INVALID_OTP: [401, "কোডটি সঠিক নয় অথবা মেয়াদোত্তীর্ণ।"],
  OTP_LOCKED: [429, "অনেকবার ভুল চেষ্টা হয়েছে। নতুন কোড চান।"],
  FORBIDDEN: [403, "এই কাজটি করার অনুমতি আপনার নেই।"],
  CSRF: [403, "নিরাপত্তা যাচাই ব্যর্থ হয়েছে। পাতাটি রিফ্রেশ করে আবার চেষ্টা করুন।"],
  NOT_FOUND: [404, "চাওয়া রেকর্ডটি পাওয়া যায়নি।"],
  CONFLICT: [409, "এই পরিবর্তন বর্তমান অবস্থার সাথে সাংঘর্ষিক।"],
  ALREADY_VOTED: [409, "এই নির্বাচনে আপনার ব্যালট ইতিমধ্যে জমা পড়েছে।"],
  INVALID_CANDIDATE: [400, "বেছে নেওয়া প্রার্থী ব্যালটে নেই।"],
  NOT_ELIGIBLE: [403, "এই নির্বাচনে ভোট দেওয়ার যোগ্যতা আপনার নেই।"],
  ELECTION_NOT_OPEN: [409, "ভোটগ্রহণ এখনো শুরু হয়নি।"],
  ELECTION_PAUSED: [409, "নির্বাচন কমিটি সাময়িকভাবে ভোটগ্রহণ স্থগিত রেখেছে।"],
  ELECTION_CLOSED: [409, "ভোটগ্রহণ শেষ হয়েছে।"],
  NO_ELECTION: [409, "কোনো সক্রিয় নির্বাচন নেই।"],
  INVALID_TRANSITION: [409, "নির্বাচনের অবস্থার এই পরিবর্তন অনুমোদিত নয়।"],
  ELECTION_LOCKED: [409, "এই নির্বাচনে এখন আর এভাবে পরিবর্তন করা যাবে না।"],
  CANDIDATES_LOCKED: [409, "ভোটগ্রহণ শুরু হলে প্রার্থী তালিকা লক হয়ে যায়।"],
  RESULTS_SEALED: [403, "নির্বাচন শেষ না হওয়া পর্যন্ত প্রার্থীভিত্তিক ফলাফল সিলগালা।"],
  SECOND_PERSON_REQUIRED: [403, "এই অনুরোধটি ভিন্ন একজন অনুমোদিত অ্যাডমিনকে পর্যালোচনা করতে হবে।"],
  INVALID_STATE: [409, "বর্তমান অবস্থায় এই কাজটি সম্ভব নয়।"],
  RECONCILIATION_FAILED: [409, "ব্যালট ও অংশগ্রহণের সংখ্যা মিলছে না।"],
  TIE_NOTE_REQUIRED: [400, "ফলাফলে সমান ভোট। কমিটির সমতা নিষ্পত্তির নোট লিপিবদ্ধ করুন।"],
  RATE_LIMITED: [429, "অনেক বেশি অনুরোধ। একটু অপেক্ষা করে আবার চেষ্টা করুন।"],
  PAYLOAD_TOO_LARGE: [413, "আপলোড করা ফাইলটি খুব বড়।"],
  UNSUPPORTED_MEDIA: [415, "এই ধরনের ফাইল সমর্থিত নয়।"],
  INTERNAL: [500, "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।"],
} as const;

export type ErrorCode = keyof typeof ERRORS;

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? ERRORS[code][1]);
  }
  get status() {
    return ERRORS[this.code][0];
  }
}

/** Maps a PostgreSQL error raised by our functions/triggers to an AppError. */
export function fromDbError(err: unknown): AppError | null {
  const e = err as { code?: string; message?: string; constraint?: string };
  if (!e || typeof e !== "object") return null;
  if (e.code === "P0001" && e.message) {
    const [head, ...rest] = e.message.split(":");
    const code = head.trim() as ErrorCode;
    if (code in ERRORS) return new AppError(code, rest.join(":").trim() || undefined);
    if (head.startsWith("IMMUTABLE")) return new AppError("CONFLICT", rest.join(":").trim() || "রেকর্ডটি অপরিবর্তনীয়।");
    return new AppError("CONFLICT");
  }
  if (e.code === "23505") return new AppError("CONFLICT", "A record with these details already exists.", { constraint: e.constraint });
  if (e.code === "23503") return new AppError("CONFLICT", "A related record prevents this change.", { constraint: e.constraint });
  if (e.code === "23514" || e.code === "22P02" || e.code === "22001") return new AppError("VALIDATION", undefined, { constraint: e.constraint });
  if (e.code === "42501") return new AppError("FORBIDDEN");
  return null;
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return fromDbError(err) ?? new AppError("INTERNAL");
}
