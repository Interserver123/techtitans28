import { adminRoute } from "@/lib/admin-route";
import { assertUuid } from "@/lib/session";
import { one } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { AppError } from "@/lib/errors";

export const GET = adminRoute<{ id: string }>("corrections.read", async (_req, { params }) => {
  const r = await one<{ evidence_path: string | null }>(`select evidence_path from correction_requests where id = $1`, [assertUuid(params.id)]);
  if (!r?.evidence_path) throw new AppError("NOT_FOUND");
  const obj = await getObject(r.evidence_path, { publicOnly: false });
  if (!obj) throw new AppError("NOT_FOUND");
  return new Response(new Uint8Array(obj.bytes), {
    headers: {
      "content-type": obj.contentType,
      "content-disposition": `attachment; filename="evidence-${params.id.slice(0, 8)}.${obj.contentType === "application/pdf" ? "pdf" : obj.contentType.split("/")[1]}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
});
