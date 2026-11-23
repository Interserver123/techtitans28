import { adminRoute } from "@/lib/admin-route";
import { ok, parseJson } from "@/lib/http";
import { assertUuid } from "@/lib/session";
import { accessLinkSchema, createAccessLink, listAccessLinks } from "@/lib/services/access-links";

export const GET = adminRoute<{ id: string }>("students.write", async (_req, { params }) => ok({ links: await listAccessLinks(assertUuid(params.id)) }));

export const POST = adminRoute<{ id: string }>("students.write", async (req, { admin, c, params }) => {
  const link = await createAccessLink(assertUuid(params.id), await parseJson(req, accessLinkSchema), admin.adminId, c.ipHash);
  return ok(link);
});
