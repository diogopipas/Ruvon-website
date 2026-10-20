import { apiError } from "@/lib/server/http";
import { ingestResend } from "@/lib/server/notifications/webhook";
import { nudgeJobs } from "@/lib/server/jobs/nudge";

export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    await ingestResend(request);
    nudgeJobs();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "Notificação temporariamente indisponível.");
  }
}
