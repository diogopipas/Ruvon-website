import "server-only";
import type { CommerceOrder } from "@/lib/commerce";
import type { Job } from "../payments/service";
import { ProviderError } from "../payments/http";
import { orderRepository } from "../orders/repository";

/** Delivery stays disabled until the real sender integrations are provisioned.
 * The durable intent survives this configuration failure; it never claims sent. */
export async function sendNotification(job: Job, order: CommerceOrder) {
  if (
    job.kind === "merchant_notify" &&
    order.operational_status !== "awaiting_merchant"
  )
    return;
  if (
    job.kind === "preparation_reminder" &&
    order.operational_status !== "preparing"
  )
    return;
  const channel = job.payload.channel === "sms" ? "sms" : "email";
  if (job.kind === "operator_alert" && job.reference_id) {
    const { data, error } = await orderRepository()
      .db.from("order_cases")
      .select("state")
      .eq("id", job.reference_id)
      .single();
    if (error) throw error;
    if (data.state !== "open") return;
  }
  await orderRepository().rpc("commerce_notification_intent", {
    p_order: order.id,
    p_key: `notification:${job.id}`,
    p_channel: channel,
    p_purpose: job.kind,
    p_recipient:
      job.kind === "operator_alert" ? "operator" : `store:${order.store_id}`,
  });
  throw new ProviderError(
    channel === "email"
      ? "email_sender_not_provisioned"
      : "sms_sender_not_provisioned",
  );
}
