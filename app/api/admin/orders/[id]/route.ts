import { z } from "zod";
import { orderOperations } from "@/lib/server/operations/service";
import { privateJson } from "@/lib/server/commerce-http";
import { apiError } from "@/lib/server/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return privateJson(
      await orderOperations(z.uuid().parse((await context.params).id)),
    );
  } catch (error) {
    return apiError(error);
  }
}
