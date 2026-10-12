import { z } from "zod";
import { commandSchema } from "@/lib/commerce";
import { merchantRpc } from "@/lib/server/merchant/service";
import { commerceInput, privateJson } from "@/lib/server/commerce-http";
import { staffSession } from "@/lib/server/merchant/auth";
import { apiError } from "@/lib/server/http";
import { nudgeJobs } from "@/lib/server/jobs/nudge";
export const maxDuration = 30;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await staffSession(),
      input = await commerceInput(request, commandSchema, user.id);
    const result = await merchantRpc("merchant_command", {
      p_order: z.uuid().parse((await context.params).id),
      p_command: input.command_id,
      p_version: input.expected_version,
      p_action: input.command,
      p_reason: input.reason ?? null,
      p_seal: input.seal ?? null,
      p_saleable: input.saleable ?? {},
    });
    nudgeJobs();
    return privateJson(result);
  } catch (error) {
    return apiError(error);
  }
}
