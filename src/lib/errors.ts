/** Error codes are stable API; messages are safe to show to end users. */
export const ERRORS = {
  VALIDATION: [400, "The request contains invalid data."],
  BAD_REQUEST: [400, "The request could not be processed."],
  UNAUTHENTICATED: [401, "Please sign in to continue."],
  SESSION_INVALID: [401, "Your voting session has expired. Please verify again."],
  MFA_REQUIRED: [401, "Multi-factor verification is required."],
  INVALID_CREDENTIALS: [401, "Invalid email or password."],
  INVALID_OTP: [401, "The code is invalid or has expired."],
  INVALID_LINK: [401, "This voting link is invalid, expired or the roll number does not match."],
  OTP_LOCKED: [429, "Too many incorrect attempts. Request a new code."],
  FORBIDDEN: [403, "You do not have permission to perform this action."],
  CSRF: [403, "Security check failed. Refresh the page and try again."],
  NOT_FOUND: [404, "The requested record was not found."],
  CONFLICT: [409, "This change conflicts with the current state."],
  ALREADY_VOTED: [409, "A ballot has already been recorded for you in this election."],
  INCOMPLETE_BALLOT: [400, "You must choose exactly one Boys' CR candidate and one Girls' CR candidate."],
  GENDER_MISMATCH: [409, "The candidate's gender does not match this position."],
  INVALID_CANDIDATE: [400, "The selected candidate is not on the ballot."],
  NOT_ELIGIBLE: [403, "You are not eligible to vote in this election."],
  ELECTION_NOT_OPEN: [409, "Voting has not opened yet."],
  ELECTION_PAUSED: [409, "Voting is temporarily paused by the Election Committee."],
  ELECTION_CLOSED: [409, "Voting has closed."],
  NO_ELECTION: [409, "There is no active election."],
  INVALID_TRANSITION: [409, "That election status change is not allowed."],
  ELECTION_LOCKED: [409, "This election can no longer be changed in that way."],
  CANDIDATES_LOCKED: [409, "The candidate list is locked once voting starts."],
  RESULTS_SEALED: [403, "Candidate-wise results are sealed until the election closes."],
  SECOND_PERSON_REQUIRED: [403, "A different authorised administrator must review this request."],
  STEP_UP_REQUIRED: [403, "Confirm your authenticator code to continue with this sensitive action."],
  UPGRADE_REQUIRED: [503, "The database needs the latest upgrade: run supabase/deploy.sql in the Supabase SQL Editor."],
  INVALID_STATE: [409, "This action is not possible in the current state."],
  RECONCILIATION_FAILED: [409, "Ballot and participation counts do not reconcile."],
  TIE_NOTE_REQUIRED: [400, "The result is tied. Record the committee's tie-resolution note."],
  RATE_LIMITED: [429, "Too many requests. Please wait and try again."],
  PAYLOAD_TOO_LARGE: [413, "The uploaded file is too large."],
  UNSUPPORTED_MEDIA: [415, "Unsupported file type."],
  INTERNAL: [500, "Something went wrong. Please try again."],
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
    if (head.startsWith("IMMUTABLE")) return new AppError("CONFLICT", rest.join(":").trim() || "Record is immutable.");
    return new AppError("CONFLICT");
  }
  if (e.code === "23505") return new AppError("CONFLICT", "A record with these details already exists.", { constraint: e.constraint });
  if (e.code === "23503") return new AppError("CONFLICT", "A related record prevents this change.", { constraint: e.constraint });
  if (e.code === "23514" || e.code === "22P02" || e.code === "22001") return new AppError("VALIDATION", undefined, { constraint: e.constraint });
  if (e.code === "42501") return new AppError("FORBIDDEN");
  // Undefined function / column / table: the app is newer than the database schema.
  if (e.code === "42883" || e.code === "42703" || e.code === "42P01") return new AppError("UPGRADE_REQUIRED");
  return null;
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return fromDbError(err) ?? new AppError("INTERNAL");
}
