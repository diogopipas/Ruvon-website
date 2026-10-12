import { quoteSchema } from "@/lib/commerce";
import { createQuote } from "@/lib/server/orders/service";
import { orderRepository } from "@/lib/server/orders/repository";
import {
  commerceInput,
  commerceOwner,
  privateJson,
} from "@/lib/server/commerce-http";
import { apiError } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    const owner = await commerceOwner(true),
      input = await commerceInput(request, quoteSchema, owner);
    const order = await createQuote(input, owner);
    return privateJson(
      {
        ...(await orderRepository().view(order)),
        quote_expires_at: order.quote_expires_at,
        eta: order.quote_snapshot.eta,
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
