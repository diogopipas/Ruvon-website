import { z } from "zod";
import { cancelSchema } from "@/lib/commerce";
import { orderRepository } from "@/lib/server/orders/repository";
import {
  commerceOwner,
  commerceInput,
  privateJson,
} from "@/lib/server/commerce-http";
import { apiError } from "@/lib/server/http";
import { nudgeJobs } from "@/lib/server/jobs/nudge";
export const maxDuration = 30;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await commerceOwner(),
      input = await commerceInput(request, cancelSchema, owner);
    const result = await orderRepository().rpc("commerce_customer_command", {
      p_order: z.uuid().parse((await context.params).id),
      p_owner: owner,
      p_command: input.command_id,
      p_version: input.expected_version,
      p_type: "cancel",
      p_reason: input.reason,
    });
    nudgeJobs();
    return privateJson(result, 202);
  } catch (error) {
    return apiError(error);
  }
}
