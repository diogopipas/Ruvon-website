import { z } from "zod";
import { commerceOwner, privateJson } from "@/lib/server/commerce-http";
import { orderRepository } from "@/lib/server/orders/repository";
import { apiError } from "@/lib/server/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const repo = orderRepository(),
      order = await repo.order(
        z.uuid().parse((await context.params).id),
        await commerceOwner(),
      );
    const { data, error } = await repo.db
      .from("provider_operations")
      .select("checkout_manifest")
      .eq("order_id", order.id)
      .eq("kind", "authorise")
      .maybeSingle();
    if (error) throw error;
    return privateJson({
      manifest:
        order.operational_status === "awaiting_payment"
          ? (data?.checkout_manifest ?? null)
          : null,
      testing: order.environment === "sandbox",
    });
  } catch (error) {
    return apiError(error);
  }
}
