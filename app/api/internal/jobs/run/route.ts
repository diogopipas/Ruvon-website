import { workerAuth, privateJson } from "@/lib/server/commerce-http";
import { runJobs } from "@/lib/server/jobs/runner";
import { apiError } from "@/lib/server/http";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    workerAuth(request);
    return privateJson(await runJobs());
  } catch (error) {
    return apiError(error, "Automação temporariamente indisponível.");
  }
}
