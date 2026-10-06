import "server-only";
import { z } from "zod";
import { providerCents } from "@/lib/payments";
import { paymentConfig } from "./payment-config";
import type { PaymentAttempt, PaymentOrder } from "./payment-store";

const paymentSchema = z.looseObject({
  id: z.uuid(),
  key: z.string(),
  value: z.union([z.number(), z.string()]),
  currency: z.string(),
  method: z.looseObject({ type: z.string(), status: z.string().optional() }),
  payment_status: z.string(),
  expiration_time: z.string().optional(),
  captures: z
    .array(
      z.looseObject({
        status: z.string(),
        value: z.union([z.number(), z.string()]),
      }),
    )
    .optional(),
});
export type EasypayPayment = z.infer<typeof paymentSchema>;

export class EasypayError extends Error {
  constructor(
    public definitive: boolean,
    public httpStatus?: number,
  ) {
    super("Easypay request failed");
    this.name = "EasypayError";
  }
}

export function mbwayPayload(order: PaymentOrder, attempt: PaymentAttempt) {
  return {
    type: "sale",
    method: "MBW",
    currency: "EUR",
    value: order.total / 100,
    key: attempt.id,
    customer: {
      phone: attempt.phone,
      phone_indicative: "+351",
      language: "PT",
      ...(attempt.email ? { email: attempt.email } : {}),
    },
    capture: {
      descriptive: `Jola sandbox ${order.id}`,
      transaction_key: attempt.id,
    },
  };
}

async function easypayRequest(path: string, init: RequestInit = {}) {
  const config = paymentConfig();
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(6000),
      headers: {
        AccountId: config.accountId,
        ApiKey: config.apiKey,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new EasypayError(false);
  }
  if (!response.ok) {
    // 409/429/5xx can be ambiguous. Never create another attempt from those.
    throw new EasypayError(
      response.status >= 400 &&
        response.status < 500 &&
        ![409, 429].includes(response.status),
      response.status,
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new EasypayError(false);
  }
}

export async function createMbwayPayment(
  order: PaymentOrder,
  attempt: PaymentAttempt,
) {
  const response = await easypayRequest("/single", {
    method: "POST",
    headers: { "Idempotency-Key": attempt.id },
    body: JSON.stringify(mbwayPayload(order, attempt)),
  });
  const parsed = z
    .looseObject({ status: z.literal("ok"), id: z.uuid() })
    .safeParse(response);
  if (!parsed.success) throw new EasypayError(false);
  return parsed.data.id;
}

export async function readEasypayPayment(id: string) {
  const parsed = paymentSchema.safeParse(
    await easypayRequest(`/single/${encodeURIComponent(id)}`),
  );
  if (!parsed.success) throw new EasypayError(false);
  return parsed.data;
}

export async function findEasypayPayment(attempt: PaymentAttempt) {
  const params = new URLSearchParams({
    key: attempt.id,
    method: "MBW",
    records_per_page: "2",
  });
  const parsed = z
    .looseObject({ data: z.array(paymentSchema) })
    .safeParse(await easypayRequest(`/single?${params}`));
  if (!parsed.success) throw new EasypayError(false);
  // Key isn't unique at the provider. More than one match requires manual review.
  if (parsed.data.data.length > 1) throw new EasypayError(false);
  return parsed.data.data[0] ?? null;
}

export function verifyEasypayPayment(
  payment: EasypayPayment,
  order: PaymentOrder,
  attempt: PaymentAttempt,
) {
  if (
    (attempt.provider_id && payment.id !== attempt.provider_id) ||
    payment.key !== attempt.id ||
    payment.currency !== "EUR" ||
    payment.method.type !== "MBW" ||
    providerCents(payment.value) !== order.total
  )
    throw new EasypayError(false);
  let state: "paid" | "pending" | "failed" | "expired" | "reconciling" =
    "reconciling";
  if (payment.payment_status === "paid") state = "paid";
  else if (
    // Observed in the real MBW sandbox after the pending scenario expires.
    // Unknown status alone is insufficient: require the failed full-value sale.
    payment.payment_status === "timeout" &&
    payment.captures?.length === 1 &&
    payment.captures[0].status === "failed" &&
    providerCents(payment.captures[0].value) === order.total
  )
    state = "expired";
  else if (["failed", "deleted", "voided"].includes(payment.payment_status))
    state = payment.method.status === "expired" ? "expired" : "failed";
  else if (["pending", "active", "authorised"].includes(payment.payment_status))
    state = "pending";
  // A local countdown is not evidence that money could no longer be captured.
  const date = payment.expiration_time;
  const expiresAt =
    date &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(date) &&
    Number.isFinite(Date.parse(date))
      ? new Date(date).toISOString()
      : null;
  return { state, expiresAt };
}
