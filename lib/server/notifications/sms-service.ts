import "server-only";
import { z } from "zod";
import type { CommerceOrder } from "@/lib/commerce";
import { orderRepository } from "../orders/repository";
import type { Job } from "../payments/service";
import { ProviderError, requireProviderBudget } from "../payments/http";
import { requireSecret } from "../commerce-config";
import {
  readSms,
  sendSms,
  smsCallback,
  smsRequestSchema,
  smsSendingConfig,
  type SmsRequest,
  type SmsFact,
} from "./twilio";

export type SmsNotification = {
  id: string;
  status: string;
  request: SmsRequest | null;
  first_dispatch_at: string | null;
  provider_id: string | null;
  order_id: string;
  environment: string;
};
export function smsText(kind: string, order: CommerceOrder, origin: string) {
  const reference = order.id.slice(0, 8).toUpperCase();
  const prefix = order.environment === "sandbox" ? "[TESTE] " : "";
  if (kind === "merchant_notify")
    return `${prefix}Ruvon ${reference}: confirma o stock ate ao prazo no painel. Aguarda autorizacao para preparar. ${origin}/merchant`;
  if (kind === "operator_alert")
    return `${prefix}Ruvon ${reference}: pedido precisa de revisao. Motivo e acoes no painel: ${origin}/admin/orders/${order.id}`;
  throw new ProviderError("unsupported_sms_template", true);
}
export async function sendSmsNotification(
  job: Job,
  order: CommerceOrder,
  n: SmsNotification,
) {
  const repo = orderRepository();
  // Persisted recovery reads/callbacks handle a dispatched SMS. Never POST it again.
  if (n.first_dispatch_at) return;
  const config = await smsSendingConfig();
  let recipient = process.env.RUVON_OPERATOR_MOBILE;
  if (job.kind !== "operator_alert") {
    const { data, error } = await repo.db
      .from("stores")
      .select("phone")
      .eq("id", order.store_id)
      .single();
    if (error) throw error;
    recipient = data.phone;
  }
  const origin = new URL(requireSecret("NEXT_PUBLIC_SITE_URL")).origin;
  const request = smsRequestSchema.parse({
    account: config.account,
    from: config.from,
    service: config.service,
    to: [recipient],
    text: smsText(job.kind, order, origin),
    callback: smsCallback(n.id),
  });
  requireProviderBudget(11000);
  const dispatch = await repo.rpc<{ allowed: boolean; request: SmsRequest }>(
    "commerce_dispatch_notification",
    { p_id: n.id, p_job: job.id, p_token: job.lease_token, p_request: request },
  );
  if (!dispatch.allowed) return;
  let fact: SmsFact;
  try {
    fact = await sendSms(dispatch.request);
  } catch (error) {
    await repo.rpc("commerce_finish_notification", {
      p_id: n.id,
      p_job: job.id,
      p_token: job.lease_token,
      p_error:
        error instanceof ProviderError ? error.classification : "sms_unknown",
      p_definitive: error instanceof ProviderError && error.definitive,
    });
    throw error;
  }
  await applySms(job, n.id, fact);
}
async function applySms(job: Job, id: string, fact: SmsFact, event?: string) {
  await orderRepository().rpc("commerce_apply_sms_fact", {
    p_job: job.id,
    p_token: job.lease_token,
    p_notification: id,
    p_fact: fact,
    p_event: event ?? null,
  });
}
export async function reconcileSms(
  job: Job,
  event?: {
    id: string;
    resource_id: string;
    account: string;
    environment: string;
    payload: { notification_id: string; quarantine_reason?: string };
  },
) {
  const repo = orderRepository();
  const id = event?.payload.notification_id ?? job.reference_id;
  if (!z.uuid().safeParse(id).success)
    throw new ProviderError("invalid_notification_id");
  const { data, error } = await repo.db
    .from("notifications")
    .select("*")
    .eq("id", id!)
    .eq("channel", "sms")
    .single();
  if (error) throw error;
  const n = data as SmsNotification;
  if (!event && ["delivered", "failed", "skipped"].includes(n.status)) return;
  const request = smsRequestSchema.parse(n.request);
  if (
    event &&
    (event.account !== request.account ||
      event.environment !== n.environment ||
      event.payload.quarantine_reason)
  )
    throw new ProviderError("sms_identity_conflict");
  const providerId = event?.resource_id ?? n.provider_id;
  if (!providerId) {
    await repo.rpc("commerce_sms_unconfirmed", {
      p_job: job.id,
      p_token: job.lease_token,
      p_notification: n.id,
    });
    return;
  }
  await applySms(job, n.id, await readSms(providerId, request), event?.id);
}
