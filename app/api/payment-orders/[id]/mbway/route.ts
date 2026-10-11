import { NextResponse } from "next/server";
import { z } from "zod";
import { mbwaySchema } from "@/lib/payments";
import { apiError, parseRequest, RequestError } from "@/lib/server/http";
import { paymentConfig } from "@/lib/server/payment-config";
import { paymentOwner, requirePaymentOrigin } from "@/lib/server/payment-http";
import { startPaymentOrder } from "@/lib/server/payment-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    paymentConfig();
    requirePaymentOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new RequestError("Pedido indisponível.", 404);
    const input = await parseRequest(request, mbwaySchema, 10);
    const order = await startPaymentOrder(id, await paymentOwner(), input);
    return NextResponse.json(order, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(
      error,
      "A confirmar pagamento. Não inicies outra tentativa ainda.",
    );
  }
}
