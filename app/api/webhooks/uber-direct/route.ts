import { apiError } from "@/lib/server/http";
import { ingestUber } from "@/lib/server/webhooks/inbox";
import { nudgeJobs } from "@/lib/server/jobs/nudge";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    await ingestUber(request);
    nudgeJobs();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "Notificação temporariamente indisponível.");
  }
}
