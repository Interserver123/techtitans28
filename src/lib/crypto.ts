import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "./env";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Keyed digest used for OTPs, session tokens, rate-limit keys and IP pseudonyms. */
export const hmac = (purpose: string, value: string) =>
  createHmac("sha256", env().APP_SECRET_PEPPER).update(`${purpose}\u0000${value}`).digest("hex");

export const ipHash = (ip: string | null | undefined) => (ip ? hmac("ip", ip).slice(0, 32) : null);

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function numericOtp(digits = 6) {
  return randomInt(0, 10 ** digits).toString().padStart(digits, "0");
}

// --- password hashing (scrypt, N=2^15) -------------------------------------
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(actual, expected);
}
/** A valid-looking hash used to equalise timing when an account does not exist. */
export const DUMMY_PASSWORD_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

// --- symmetric encryption for MFA secrets (AES-256-GCM) --------------------
export function encrypt(plain: string) {
  const key = Buffer.from(env().APP_ENCRYPTION_KEY, "base64");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}
export function decrypt(blob: string) {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1") throw new Error("Unsupported ciphertext version");
  const key = Buffer.from(env().APP_ENCRYPTION_KEY, "base64");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
