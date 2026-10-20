import "server-only";
import { z } from "zod";
import type { CommerceOrder, OrderState } from "@/lib/commerce";
import type { Job } from "../payments/service";
import { ProviderError } from "../payments/http";
import { orderRepository } from "../orders/repository";
import { requireSecret } from "../commerce-config";
import { emailConfig, sendEmail, type EmailRequest } from "./resend";
import { emailRequest, notificationText } from "./templates";
import { sendSmsNotification, type SmsNotification } from "./sms-service";
import { smsRequestSchema, type SmsRequest } from "./twilio";

type Notification = Omit<SmsNotification, "request"> & {
  request: EmailRequest | SmsRequest | null;
  deduplication_key: string;
};

export async function sendNotification(job: Job, order: CommerceOrder) {
  const repo = orderRepository();
  const customer =
    job.kind === "customer_update" || job.kind === "customer_refund";
  if (customer && !order.recipient_email) return;
  const channel = job.payload.channel === "sms" ? "sms" : "email";
  const notification = await repo.rpc<Notification>(
    "commerce_prepare_notification",
    {
      p_job: job.id,
      p_token: job.lease_token,
      p_channel: channel,
      p_recipient: customer
        ? "customer"
        : job.kind === "operator_alert"
          ? "operator"
          : `store:${order.store_id}`,
    },
  );
  if (
    ["sent", "delivered", "failed", "delayed", "skipped"].includes(
      notification.status,
    )
  )
    return;
  if (channel === "sms")
    return sendSmsNotification(job, order, {
      ...notification,
      request: notification.request
        ? smsRequestSchema.parse(notification.request)
        : null,
    });
  const config = emailConfig();
  let request = notification.request as EmailRequest | null;
  if (!request) {
    let recipient = customer
      ? order.recipient_email!
      : process.env.RUVON_OPERATOR_EMAIL;
    if (!customer && job.kind !== "operator_alert") {
      const { data, error } = await repo.db
        .from("stores")
        .select("email")
        .eq("id", order.store_id)
        .single();
      if (error) throw error;
      recipient = data.email;
    }
    if (!z.email().safeParse(recipient).success)
      throw new ProviderError("notification_recipient_missing", true);
    const site = new URL(requireSecret("NEXT_PUBLIC_SITE_URL"));
    if (
      site.protocol !== "https:" &&
      !(process.env.NODE_ENV === "development" && site.hostname === "localhost")
    )
      throw new ProviderError("invalid_notification_origin", true);
    const message = notificationText(
      job.kind,
      order,
      site.origin,
      (job.payload.state as OrderState | undefined) ?? order.operational_status,
    );
    request = emailRequest(
      notification.id,
      order.environment,
      config,
      recipient!,
      message,
    );
  }
  const dispatch = await repo.rpc<{
    allowed: boolean;
    reason?: string;
    request: EmailRequest;
  }>("commerce_dispatch_notification", {
    p_id: notification.id,
    p_job: job.id,
    p_token: job.lease_token,
    p_request: request,
  });
  if (!dispatch.allowed) {
    if (dispatch.reason === "replay_expired")
      throw new ProviderError("email_reconciliation_required");
    return;
  }
  let id: string;
  try {
    id = await sendEmail(dispatch.request, notification.deduplication_key);
  } catch (error) {
    await repo.rpc("commerce_finish_notification", {
      p_id: notification.id,
      p_job: job.id,
      p_token: job.lease_token,
      p_error:
        error instanceof ProviderError ? error.classification : "email_unknown",
      p_definitive: error instanceof ProviderError && error.definitive,
    });
    throw error;
  }
  await repo.rpc("commerce_finish_notification", {
    p_id: notification.id,
    p_job: job.id,
    p_token: job.lease_token,
    p_provider_id: id,
  });
}
