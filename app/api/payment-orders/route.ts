import { NextResponse } from "next/server";
import { apiError, parseRequest } from "@/lib/server/http";
import { paymentOrderSchema } from "@/lib/payments";
import { paymentConfig } from "@/lib/server/payment-config";
import { paymentOwner, requirePaymentOrigin } from "@/lib/server/payment-http";
import { paymentStore, paymentView } from "@/lib/server/payment-store";

export async function POST(request: Request) {
  try {
    paymentConfig();
    requirePaymentOrigin(request);
    const input = await parseRequest(request, paymentOrderSchema, 20);
    const ownerHash = await paymentOwner(true);
    const store = paymentStore();
    const order = await store.create(input, ownerHash);
    const attempt = order.current_attempt_id
      ? await store.attempt(order.current_attempt_id)
      : null;
    return NextResponse.json(paymentView(order, attempt), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(
      error,
      "Não conseguimos preparar o pagamento. O carrinho continua guardado.",
    );
  }
}
