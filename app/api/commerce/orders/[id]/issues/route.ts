import { z } from "zod";
import { issueSchema } from "@/lib/commerce";
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
      input = await commerceInput(request, issueSchema, owner);
    const result = await orderRepository().rpc("commerce_customer_command", {
      p_order: z.uuid().parse((await context.params).id),
      p_owner: owner,
      p_command: input.command_id,
      p_version: input.expected_version,
      p_type: input.type,
      p_reason: input.reason,
      p_evidence: input.evidence,
    });
    nudgeJobs();
    return privateJson(result, 202);
  } catch (error) {
    return apiError(error);
  }
}
