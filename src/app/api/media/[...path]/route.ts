import { getObject } from "@/lib/storage";

/** Serves PUBLIC media (candidate photos) from the database storage driver. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.join("/");
  if (!key.startsWith("candidates/")) return new Response("Not found", { status: 404 });
  const obj = await getObject(key, { publicOnly: true });
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(obj.bytes), {
    headers: {
      "content-type": obj.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
