import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, RequestError } from "@/lib/server/http";
import { paymentConfig } from "@/lib/server/payment-config";
import { paymentOwner } from "@/lib/server/payment-http";
import { readPaymentOrder } from "@/lib/server/payment-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    paymentConfig();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new RequestError("Pedido indisponível.", 404);
    const order = await readPaymentOrder(id, await paymentOwner());
    return NextResponse.json(order, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(
      error,
      "A confirmar pagamento. Não inicies outra tentativa ainda.",
    );
  }
}
