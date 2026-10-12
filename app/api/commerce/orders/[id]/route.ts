import { z } from "zod";
import { orderRepository } from "@/lib/server/orders/repository";
import { commerceOwner, privateJson } from "@/lib/server/commerce-http";
import { apiError } from "@/lib/server/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().parse((await context.params).id),
      repo = orderRepository();
    return privateJson(
      await repo.view(await repo.order(id, await commerceOwner())),
    );
  } catch (error) {
    return apiError(error);
  }
}
