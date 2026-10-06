import "server-only";
import { paymentInProgress } from "@/lib/payments";
import {
  createMbwayPayment,
  EasypayError,
  findEasypayPayment,
  readEasypayPayment,
  verifyEasypayPayment,
} from "./easypay";
import {
  paymentStore,
  paymentView,
  type PaymentAttempt,
  type PaymentOrder,
} from "./payment-store";

export async function reconcilePayment(
  store: ReturnType<typeof paymentStore>,
  order: PaymentOrder,
  attempt: PaymentAttempt,
  notificationId?: string,
) {
  const payment = notificationId
    ? await readEasypayPayment(notificationId)
    : attempt.provider_id
      ? await readEasypayPayment(attempt.provider_id)
      : await findEasypayPayment(attempt);
  if (!payment) {
    // No match doesn't prove a timed-out POST was rejected. No blind replay,
    // including after Easypay's 24-hour idempotency window has expired.
    return store.settle(attempt, "reconciling");
  }
  const { state, expiresAt } = verifyEasypayPayment(payment, order, attempt);
  return store.settle(attempt, state, payment.id, expiresAt);
}

export async function readPaymentOrder(id: string, ownerHash: string) {
  const store = paymentStore();
  let order = await store.owned(id, ownerHash);
  let attempt = order.current_attempt_id
    ? await store.attempt(order.current_attempt_id)
    : null;
  if (
    attempt &&
    paymentInProgress(order.state) &&
    (await store.claimCheck(attempt.id))
  ) {
    try {
      await reconcilePayment(store, order, attempt);
    } catch {
      await store.settle(attempt, "reconciling");
    }
    order = await store.owned(id, ownerHash);
    attempt = order.current_attempt_id
      ? await store.attempt(order.current_attempt_id)
      : null;
  }
  return paymentView(order, attempt);
}

export async function startPaymentOrder(
  id: string,
  ownerHash: string,
  input: { phone: string; email?: string; retry: boolean },
) {
  const store = paymentStore();
  const order = await store.owned(id, ownerHash);
  const claimed = await store.start(
    order,
    input.phone,
    input.email,
    input.retry,
  );
  if (!claimed.should_create) return readPaymentOrder(id, ownerHash);
  let attempt = claimed.attempt;
  try {
    const providerId = await createMbwayPayment(order, attempt);
    attempt = await store.settle(attempt, "pending", providerId);
  } catch (error) {
    await store.settle(
      attempt,
      error instanceof EasypayError && error.definitive
        ? "failed"
        : "reconciling",
    );
    return readPaymentOrder(id, ownerHash);
  }
  try {
    await reconcilePayment(store, order, attempt);
  } catch {
    await store.settle(attempt, "reconciling");
  }
  return readPaymentOrder(id, ownerHash);
}
