import "server-only";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { one, query } from "./db";
import { AppError } from "./errors";
import { randomToken } from "./crypto";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

function sniff(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.length > 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

/**
 * Validates a candidate photo by magic bytes (never by filename or client MIME),
 * then fully re-encodes it to WebP. Re-encoding strips EXIF/GPS metadata and
 * neutralises polyglot files.
 */
export async function processCandidatePhoto(input: Buffer) {
  if (input.length === 0) throw new AppError("VALIDATION", "The file is empty.");
  if (input.length > MAX_PHOTO_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", "Photos must be 3 MB or smaller.");
  const kind = sniff(input);
  if (!kind || kind === "application/pdf") throw new AppError("UNSUPPORTED_MEDIA", "Upload a JPEG, PNG or WebP image.");
  try {
    const img = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) {
      throw new AppError("VALIDATION", "Photos must be at least 200×200 pixels.");
    }
    return await img.rotate().resize(800, 800, { fit: "cover", position: "attention" }).webp({ quality: 84 }).toBuffer();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("UNSUPPORTED_MEDIA", "The image could not be processed.");
  }
}

export function validateEvidence(input: Buffer) {
  if (input.length === 0) throw new AppError("VALIDATION", "The file is empty.");
  if (input.length > MAX_EVIDENCE_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", "Evidence files must be 5 MB or smaller.");
  const kind = sniff(input);
  if (!kind) throw new AppError("UNSUPPORTED_MEDIA", "Evidence must be a PDF, JPEG, PNG or WebP file.");
  return kind;
}

function supabase() {
  const e = env();
  return createClient(e.SUPABASE_URL!, e.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export async function putObject(kind: "photo" | "evidence", bytes: Buffer, contentType: string) {
  const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1];
  const path = `${kind === "photo" ? "candidates" : "evidence"}/${randomToken(18)}.${ext}`;
  if (env().STORAGE_DRIVER === "supabase") {
    const bucket = kind === "photo" ? env().SUPABASE_PHOTO_BUCKET : env().SUPABASE_EVIDENCE_BUCKET;
    const { error } = await supabase().storage.from(bucket).upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new AppError("INTERNAL", "Upload failed.");
  } else {
    await query(`insert into media_objects (path, content_type, is_public, bytes) values ($1, $2, $3, $4)`, [path, contentType, kind === "photo", bytes]);
  }
  return path;
}

export async function getObject(path: string, opts: { publicOnly: boolean }) {
  if (!/^[A-Za-z0-9/_.-]{1,200}$/.test(path) || path.includes("..")) return null;
  if (env().STORAGE_DRIVER === "supabase") {
    const bucket = path.startsWith("candidates/") ? env().SUPABASE_PHOTO_BUCKET : env().SUPABASE_EVIDENCE_BUCKET;
    if (opts.publicOnly && bucket !== env().SUPABASE_PHOTO_BUCKET) return null;
    const { data, error } = await supabase().storage.from(bucket).download(path);
    if (error || !data) return null;
    return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
  }
  const row = await one<{ bytes: Buffer; content_type: string; is_public: boolean }>(
    `select bytes, content_type, is_public from media_objects where path = $1`,
    [path],
  );
  if (!row || (opts.publicOnly && !row.is_public)) return null;
  return { bytes: row.bytes, contentType: row.content_type };
}

/** Public URL for an approved candidate photo. */
export function photoUrl(path: string | null) {
  if (!path) return null;
  if (env().STORAGE_DRIVER === "supabase") {
    return `${env().SUPABASE_URL}/storage/v1/object/public/${env().SUPABASE_PHOTO_BUCKET}/${path}`;
  }
  return `/api/media/${path}`;
}
