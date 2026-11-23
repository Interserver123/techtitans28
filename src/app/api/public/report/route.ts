import { route, errorResponse } from "@/lib/http";
import { getCurrentElection } from "@/lib/services/elections";
import { buildResultReport } from "@/lib/services/report";
import { AppError } from "@/lib/errors";

/** Official PDF report — only after publication. */
export const GET = route(async () => {
  const e = await getCurrentElection();
  if (!e || e.status !== "RESULTS_PUBLISHED") return errorResponse(new AppError("RESULTS_SEALED", "The official report is available after results are published."));
  const pdf = await buildResultReport(e.id);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="techtitans28-cr-election-official-report.pdf"`,
      "cache-control": "no-store",
    },
  });
});
