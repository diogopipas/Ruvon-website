import type { CommercePaymentState, OrderState } from "@/lib/commerce";
export type TransitionFacts = {
  payment: CommercePaymentState;
  delivery?: string;
  acceptance_deadline?: string | null;
  now?: Date;
  settlement?: string;
  capturedCents?: number;
  refundedCents?: number;
  deliveryDirection?: "outbound" | "return";
};
export const transitions: Record<OrderState, readonly OrderState[]> = {
  awaiting_payment: ["awaiting_merchant", "cancelling", "manual_review"],
  awaiting_merchant: ["confirming", "cancelling", "manual_review"],
  confirming: ["preparing", "cancelling", "manual_review"],
  preparing: ["ready_for_pickup", "in_delivery", "cancelling", "manual_review"],
  ready_for_pickup: ["preparing", "in_delivery", "cancelling", "manual_review"],
  in_delivery: ["delivered", "returning", "manual_review"],
  delivered: ["completed", "manual_review"],
  completed: [],
  cancelling: ["cancelled", "returning", "manual_review"],
  cancelled: [],
  returning: ["returned", "manual_review"],
  returned: ["cancelled", "completed", "manual_review"],
  manual_review: [], // Recovery uses a separately approved, audited command.
};
export function canTransition(
  from: OrderState,
  to: OrderState,
  facts: TransitionFacts,
) {
  if (!transitions[from].includes(to)) return false;
  if (to === "awaiting_merchant") return facts.payment === "authorised";
  if (to === "confirming")
    return (
      facts.payment === "authorised" &&
      !!facts.acceptance_deadline &&
      Date.parse(facts.acceptance_deadline) >
        (facts.now ?? new Date()).getTime()
    );
  if (to === "preparing" || to === "ready_for_pickup")
    return (
      facts.payment === "paid" &&
      ["pending", "pickup"].includes(facts.delivery ?? "")
    );
  if (to === "in_delivery")
    return (
      ["pickup_complete", "dropoff", "delivered"].includes(
        facts.delivery ?? "",
      ) && facts.payment === "paid"
    );
  if (to === "delivered")
    return (
      facts.payment === "paid" &&
      facts.delivery === "delivered" &&
      facts.deliveryDirection !== "return"
    );
  if (to === "returned")
    return (
      facts.deliveryDirection === "return" && facts.delivery === "delivered"
    );
  if (to === "completed")
    return facts.payment === "paid" && facts.settlement === "settled";
  if (to === "cancelled")
    return (
      (["not_started", "failed", "expired", "voided"].includes(facts.payment) ||
        (facts.payment === "paid" &&
          Number.isSafeInteger(facts.capturedCents) &&
          facts.capturedCents! > 0 &&
          facts.refundedCents === facts.capturedCents)) &&
      (!facts.delivery ||
        ["canceled", "returned"].includes(facts.delivery) ||
        (facts.deliveryDirection === "return" &&
          facts.delivery === "delivered"))
    );
  return true;
}
