import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { hash, rawBody, secureEqual } from "../commerce-http";
import {
  commerceEnvironment,
  requireSecret,
  uberConfig,
} from "../commerce-config";
import { RequestError } from "../http";
import { orderRepository } from "../orders/repository";
import { runOperation, type Job } from "../payments/service";
import type { ProviderOperation } from "../payments/provider";
import { UberDirectProvider } from "../delivery/uber-direct";
import { deliveryFact } from "../delivery/facts";
import { paymentStore } from "../payment-store";
import { reconcilePayment } from "../payment-service";
const generic = z.object({
  id: z.uuid(),
  key: z.string().min(1).max(50),
  type: z.string().max(50),
  status: z.enum(["success", "failed"]),
});
export function verifyUberSignature(
  raw: Buffer,
  signature: string,
  key: string,
) {
  return (
    /^[a-fA-F0-9]{64}$/.test(signature) &&
    secureEqual(
      signature.toLowerCase(),
      createHmac("sha256", key).update(raw).digest("hex"),
    )
  );
}
export async function ingestEasypay(request: Request) {
  const expected = `Basic ${Buffer.from(`${requireSecret("EASYPAY_WEBHOOK_USERNAME")}:${requireSecret("EASYPAY_WEBHOOK_PASSWORD", 32)}`).toString("base64")}`;
  if (!secureEqual(request.headers.get("authorization") ?? "", expected))
    throw new RequestError("Não autorizado.", 401);
  const raw = await rawBody(request);
  let payload: z.infer<typeof generic>;
  try {
    payload = generic.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    throw new RequestError("Notificação inválida.");
  }
  await orderRepository().rpc("commerce_ingest_event", {
    p_data: {
      provider: "easypay",
      account: requireSecret("EASYPAY_ACCOUNT_ID"),
      environment: commerceEnvironment(),
      event_identity: hash(JSON.stringify(payload)),
      resource_id: payload.id,
      payload_hash: hash(raw),
      payload,
    },
  });
}
export async function ingestUber(request: Request) {
  const raw = await rawBody(request, 64000);
  if (
    !verifyUberSignature(
      raw,
      request.headers.get("x-uber-signature") ?? "",
      requireSecret("UBER_WEBHOOK_SIGNING_KEY"),
    )
  )
    throw new RequestError("Não autorizado.", 401);
  const schema = z.object({
    id: z.string().startsWith("evt_"),
    kind: z.string(),
    customer_id: z.string(),
    live_mode: z.boolean(),
    delivery_id: z.string().optional(),
    created: z.iso.datetime({ offset: true }),
    data: z.object({ id: z.string(), external_id: z.string().optional() }),
  });
  let p: z.infer<typeof schema>;
  try {
    p = schema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    throw new RequestError("Notificação inválida.");
  }
  const config = uberConfig();
  if (
    p.customer_id !== config.customer ||
    p.live_mode !== (config.environment === "live")
  )
    throw new RequestError("Conta inválida.", 403);
  // Persist only references, never the raw address/identity-document fields.
  await orderRepository().rpc("commerce_ingest_event", {
    p_data: {
      provider: "uber",
      account: config.customer,
      environment: config.environment,
      event_identity: p.id,
      resource_id: p.delivery_id ?? p.data.id,
      payload_hash: hash(raw),
      provider_time: p.created,
      payload: p,
    },
  });
}
export async function processInbox(job: Job) {
  const repo = orderRepository();
  const { data: event, error } = await repo.db
    .from("external_events")
    .select("*")
    .eq("id", job.reference_id!)
    .single();
  if (error) throw error;
  const complete = (order?: string, reason?: string, bindOnly = false) =>
    repo.rpc("commerce_process_inbox", {
      p_event: event.id,
      p_job: job.id,
      p_token: job.lease_token,
      p_order: order ?? null,
      p_error: reason ?? null,
      p_bind_only: bindOnly,
    });
  if (event.state === "quarantined") return;
  if (event.provider === "easypay") {
    const p = generic.parse(event.payload);
    const key = z.uuid().safeParse(p.key);
    if (!key.success) {
      await complete(undefined, "UNMATCHED_NOTIFICATION");
      return;
    }
    const { data: operations, error } = await repo.db
      .from("provider_operations")
      .select("*")
      .eq("provider", "easypay")
      .eq("account", event.account)
      .eq("environment", event.environment)
      .or(`idempotency_key.eq.${key.data},attempt_id.eq.${key.data}`);
    if (error) throw error;
    const kind = p.type === "authorisation" ? "authorise" : p.type;
    const op = (operations as ProviderOperation[]).find((o) => o.kind === kind);
    if (!op) {
      if (operations?.length) {
        const related = (operations as ProviderOperation[])[0];
        await repo.rpc("commerce_open_case", {
          p_order: related.order_id,
          p_key: `unhandled-event:${event.id}`,
          p_type: "provider",
          p_reason: "UNSUPPORTED_PROVIDER_EVENT",
        });
        await complete(related.order_id, "UNSUPPORTED_PROVIDER_EVENT");
        return;
      }
      // Sandbox Single Sale compatibility remains isolated from commerce.
      if (
        event.environment === "sandbox" &&
        ["capture", "authorisation"].includes(p.type)
      ) {
        const legacy = paymentStore(),
          attempt = await legacy.attempt(key.data);
        if (attempt) {
          await complete(attempt.order.id, undefined, true);
          await reconcilePayment(legacy, attempt.order, attempt, p.id);
          await complete(attempt.order.id);
          return;
        }
      }
      await complete(undefined, "UNMATCHED_NOTIFICATION");
      return;
    }
    await complete(op.order_id, undefined, true);
    job.order_id = op.order_id;
    const result = await runOperation(job, op, p.id);
    if (result === "unknown" || result === "pending")
      throw new Error("pending");
    await complete(op.order_id);
  } else if (event.provider === "uber") {
    const provider = new UberDirectProvider();
    const d = await provider.read(event.resource_id);
    const { data: stored, error } = await repo.db
      .from("deliveries")
      .select("order_id,direction,parent_delivery_id")
      .eq("provider_account", event.account)
      .eq("environment", event.environment)
      .eq("provider_delivery_id", d.id)
      .maybeSingle();
    if (error) throw error;
    let orderId = stored?.order_id as string | undefined;
    const fact = deliveryFact(d);
    if (!orderId && d.id.startsWith("ret_") && fact.parent_id) {
      const { data: parent, error: parentError } = await repo.db
        .from("deliveries")
        .select("order_id")
        .eq("provider_account", event.account)
        .eq("environment", event.environment)
        .eq("provider_delivery_id", fact.parent_id)
        .eq("direction", "outbound")
        .maybeSingle();
      if (parentError) throw parentError;
      orderId = parent?.order_id;
      if (!orderId) throw new Error("pending"); // Recover the original booking before ingesting its return.
    }
    if (!orderId) {
      if (!d.id.startsWith("del_")) {
        await complete(undefined, "UNMATCHED_RETURN");
        return;
      }
      const external = z.uuid().safeParse(d.external_id);
      if (external.success) orderId = external.data;
      if (!orderId) {
        await complete(undefined, "UNMATCHED_DELIVERY");
        return;
      }
      const op = await repo.db
        .from("provider_operations")
        .select("*")
        .eq("order_id", orderId)
        .eq("kind", "delivery_create")
        .eq("account", event.account)
        .eq("environment", event.environment)
        .maybeSingle();
      if (op.error) throw op.error;
      if (!op.data || d.external_id !== op.data.order_id) {
        await complete(undefined, "UNMATCHED_DELIVERY");
        return;
      }
      await complete(orderId, undefined, true);
      job.order_id = orderId;
      const result = await runOperation(
        job,
        op.data as ProviderOperation,
        d.id,
      );
      if (result !== "succeeded") throw new Error("pending");
    } else await complete(orderId, undefined, true);
    await repo.rpc("commerce_apply_delivery", {
      p_order: orderId,
      p_fact: fact,
      p_job: job.id,
      p_token: job.lease_token,
    });
    await complete(orderId);
  } else await complete(undefined, "UNSUPPORTED_PROVIDER_EVENT");
}
