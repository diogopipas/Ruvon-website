import { startOrderSchema } from "@/lib/commerce";
import { startOrder } from "@/lib/server/orders/service";
import {
  commerceInput,
  commerceOwner,
  privateJson,
} from "@/lib/server/commerce-http";
import { apiError } from "@/lib/server/http";
import { nudgeJobs } from "@/lib/server/jobs/nudge";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    const owner = await commerceOwner();
    const result = await startOrder(
      await commerceInput(request, startOrderSchema, owner),
      owner,
    );
    nudgeJobs();
    return privateJson(result, 202);
  } catch (error) {
    return apiError(error);
  }
}
