import { z } from "zod";
import { operationsControl } from "@/lib/server/operations/service";
import { commerceInput, privateJson } from "@/lib/server/commerce-http";
import { staffSession } from "@/lib/server/merchant/auth";
import { nudgeJobs } from "@/lib/server/jobs/nudge";
import { apiError } from "@/lib/server/http";

const schema = z
  .object({
    command_id: z.uuid(),
    action: z.enum(["pause_store", "resume_store", "retry_event"]),
    target_id: z.uuid(),
    expected_version: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(400),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const { user } = await staffSession(true);
    const input = await commerceInput(request, schema, user.id);
    const result = await operationsControl(input);
    if (input.action === "retry_event") nudgeJobs();
    return privateJson(result, input.action === "retry_event" ? 202 : 200);
  } catch (error) {
    return apiError(error);
  }
}
