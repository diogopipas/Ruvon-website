import { NextResponse } from "next/server";
import { apiError, RequestError } from "@/lib/server/http";
import { verifyWebhookAuth, webhookJson } from "@/lib/server/payment-http";
import { paymentStore } from "@/lib/server/payment-store";
import { reconcilePayment } from "@/lib/server/payment-service";

export async function POST(request: Request) {
  try {
    verifyWebhookAuth(request);
    const notification = await webhookJson(request);
    // This integration creates Single Sale only. Its generic id is the Single
    // payment id and its key is capture.transaction_key, both verified below.
    if (!["capture", "authorisation"].includes(notification.type))
      return NextResponse.json({ ok: true });
    const store = paymentStore();
    const attempt = await store.attempt(notification.key);
    if (!attempt) throw new RequestError("Tentativa ainda indisponível.", 503);
    await reconcilePayment(store, attempt.order, attempt, notification.id);
    // Acknowledge only after verified state is durably stored. A transient
    // failure returns 503 so Easypay will deliver the callback again.
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Não foi possível confirmar a notificação.");
  }
}
