import { apiError } from "@/lib/server/http";
import { ingestTwilio } from "@/lib/server/notifications/twilio-webhook";
import { nudgeJobs } from "@/lib/server/jobs/nudge";

export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    await ingestTwilio(request);
    nudgeJobs();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "Notificação temporariamente indisponível.");
  }
}
