import { adminRoute } from "@/lib/admin-route";
import { ok } from "@/lib/http";
import { verifyAuditChain } from "@/lib/services/audit-read";

export const GET = adminRoute("audit.read", async () => ok({ chain: await verifyAuditChain() }));
