import "server-only";
import { randomUUID } from "node:crypto";
import type { CommerceOrder } from "@/lib/commerce";
import { orderRepository } from "../orders/repository";
import { easypayCommerceConfig, uberConfig } from "../commerce-config";
import {
  currentAttempt,
  operationFor,
  prepareOperation,
  runOperation,
  type Job,
} from "../payments/service";
import { EasypayProvider } from "../payments/easypay";
import { UberDirectProvider } from "../delivery/uber-direct";
import { ProviderError } from "../payments/http";
import type { ProviderOperation } from "../payments/provider";
import type { Store } from "../orders/routing";
import { processInbox } from "../webhooks/inbox";
import { sendNotification } from "../notifications/service";
import { deliveryFact } from "../delivery/facts";
const pending = () => {
  throw new Error("pending");
};
async function storeFor(order: CommerceOrder) {
  const { data, error } = await orderRepository()
    .db.from("stores")
    .select("*")
    .eq("id", order.store_id)
    .single();
  if (error) throw error;
  return data as Store;
}
async function run(job: Job, op: ProviderOperation) {
  const result = await runOperation(job, op);
  if (["pending", "unknown"].includes(result)) pending();
  return result;
}
async function authorise(job: Job, o: CommerceOrder) {
  if (o.operational_status !== "awaiting_payment") return;
  const a = await currentAttempt(o),
    key = `authorise:${a.id}`;
  let op = await operationFor(key);
  if (!op) {
    const customer = {
      name: o.recipient_name,
      phone: o.recipient_phone,
      phone_indicative: "+351",
      ...(o.recipient_email ? { email: o.recipient_email } : {}),
    };
    op = await prepareOperation(
      job,
      o,
      "authorise",
      key,
      {
        path: a.method === "CC" ? "/checkout" : "/single",
        method: "POST",
        amount: o.total,
        body:
          a.method === "CC"
            ? {
                type: ["single"],
                payment: {
                  methods: ["CC"],
                  type: "authorisation",
                  currency: "EUR",
                  key: a.id,
                },
                order: { key: a.id, value: o.total / 100 },
                customer,
              }
            : {
                type: "authorisation",
                method: "MBW",
                currency: "EUR",
                value: o.total / 100,
                key: a.id,
                customer,
              },
      },
      easypayCommerceConfig().account,
      a.id,
    );
  }
  await run(job, op);
}
async function confirm(job: Job, o: CommerceOrder) {
  if (o.operational_status !== "confirming" || o.review_reason) return;
  const a = await currentAttempt(o),
    key = `capture:${a.id}`;
  const existing = await operationFor(key);
  if (existing) {
    await run(job, existing);
    return;
  }
  if (
    !a.authorisation_id ||
    !(await new EasypayProvider().authorisationValid(
      a.authorisation_id,
      a.id,
      o.total,
    ))
  )
    throw new ProviderError("authorisation_not_confirmed");
  let quote = o.quote_snapshot;
  if (Date.parse(quote.expires_at) - Date.now() < 120000)
    quote = await new UberDirectProvider().quote(
      quote.pickup_address,
      quote.dropoff_address,
    );
  if (quote.fee > o.delivery_fee) {
    await orderRepository().rpc("commerce_fail_order", {
      p_order: o.id,
      p_reason: "DELIVERY_QUOTE_INCREASED",
    });
    return;
  }
  const store = await storeFor(o),
    config = easypayCommerceConfig();
  if (!store.easypay_account_id || !store.clearing_period)
    throw new ProviderError("split_configuration_unverified");
  const operation = await prepareOperation(
    job,
    o,
    "capture",
    key,
    {
      path: `/capture/${a.authorisation_id}`,
      method: "POST",
      parent_id: a.authorisation_id,
      quote,
      body: {
        value: o.total / 100,
        descriptive: `Ruvon ${o.id}`,
        splits: [
          {
            split_key: "merchant",
            account: { id: store.easypay_account_id },
            value: o.allocation.merchant / 100,
            clearing_period: store.clearing_period,
          },
          {
            split_key: "ruvon",
            account: { id: config.marketplaceAccount },
            value: o.allocation.ruvon / 100,
            clearing_period: store.clearing_period,
          },
        ],
      },
    },
    config.account,
    a.id,
  );
  // The operation UUID is the stable transaction key as well as the HTTP key.
  await run(job, operation);
}
async function booking(job: Job, o: CommerceOrder) {
  if (
    o.operational_status !== "confirming" ||
    o.payment_status !== "paid" ||
    o.review_reason
  )
    return;
  const a = await currentAttempt(o),
    key = `booking:${o.id}`;
  const existing = await operationFor(key);
  if (existing) {
    await run(job, existing);
    return;
  }
  const capture = await operationFor(`capture:${a.id}`);
  if (!capture || capture.status !== "succeeded") pending();
  let quote = (capture!.request.quote ??
    o.quote_snapshot) as CommerceOrder["quote_snapshot"];
  if (Date.parse(quote.expires_at) <= Date.now())
    quote = await new UberDirectProvider().quote(
      quote.pickup_address,
      quote.dropoff_address,
    );
  if (quote.fee > o.delivery_fee) {
    await orderRepository().rpc("commerce_fail_order", {
      p_order: o.id,
      p_reason: "DELIVERY_QUOTE_INCREASED",
    });
    return;
  }
  const store = await storeFor(o),
    config = uberConfig();
  const stock = await orderRepository().products(o.store_id);
  const body: Record<string, unknown> = {
    quote_id: quote.id,
    pickup_address: JSON.stringify(quote.pickup_address),
    dropoff_address: JSON.stringify(quote.dropoff_address),
    pickup_name: store.name,
    pickup_phone_number: store.phone,
    dropoff_name: o.recipient_name,
    dropoff_phone_number: `+351${o.recipient_phone}`,
    external_id: o.id,
    undeliverable_action: "return",
    deliverable_action: "deliverable_action_meet_at_door",
    pickup_ready_dt: new Date(
      Date.now() + store.preparation_minutes * 60000,
    ).toISOString(),
    manifest_items: o.items.flatMap((line) =>
      line.recipe.map((p) => ({
        name: stock.find((s) => s.sku === p.sku)?.sku ?? p.sku,
        quantity: p.quantity * line.quantity,
        size: "small",
      })),
    ),
    ...(o.requires_age_verification
      ? { dropoff_verification: { identification: { min_age: 18 } } }
      : {}),
    ...(config.environment === "sandbox"
      ? {
          test_specifications: { robo_courier_specification: { mode: "auto" } },
        }
      : {}),
  };
  const op = await prepareOperation(
    job,
    o,
    "delivery_create",
    key,
    { path: "/deliveries", method: "POST", body },
    config.customer,
    a.id,
  );
  await run(job, op);
}
async function cancel(job: Job, o: CommerceOrder) {
  if (o.operational_status !== "cancelling") return;
  const repo = orderRepository();
  if (await repo.rpc<boolean>("commerce_close_cancellation", { p_order: o.id }))
    return;
  const operations = await repo.list<ProviderOperation>(
    "provider_operations",
    o.id,
  );
  for (const op of operations.filter(
    (p) =>
      ["authorise", "capture", "delivery_create", "delivery_cancel"].includes(
        p.kind,
      ) && !["succeeded", "failed"].includes(p.status),
  )) {
    if (op.status === "created") pending(); // Dispatch guard prevents starting an abandoned mutation.
    await run(job, op);
  }
  const deliveries = await repo.list<{
    provider_delivery_id: string;
    direction: string;
    status: string;
  }>("deliveries", o.id);
  if (
    deliveries.some(
      (d) =>
        !["canceled", "returned"].includes(d.status) &&
        !(d.direction === "return" && d.status === "delivered"),
    )
  ) {
    await repo.rpc("commerce_open_case", {
      p_order: o.id,
      p_key: `safe-cancellation:${o.id}`,
      p_type: "delivery",
      p_reason: "DELIVERY_CANCELLATION_REQUIRES_VERIFIED_POLICY",
    });
    return;
  }
  const fresh = await repo.order(o.id),
    a = await currentAttempt(fresh),
    config = easypayCommerceConfig();
  if (fresh.payment_status === "authorised") {
    if (!a.authorisation_id) pending();
    const key = `void:${a.id}`;
    const op =
      (await operationFor(key)) ??
      (await prepareOperation(
        job,
        fresh,
        "void",
        key,
        {
          path: `/void/${a.authorisation_id}`,
          method: "POST",
          parent_id: a.authorisation_id,
          body: { descriptive: "Ruvon: cancelamento do pedido" },
        },
        config.account,
        a.id,
      ));
    await run(job, op);
  } else if (fresh.payment_status === "paid") {
    const refunds = await repo.list<{
      id: string;
      amount: number;
      status: string;
      allocation: { products: number; service: number; delivery: number };
    }>("refunds", o.id);
    const reserved = refunds.filter((r) => r.status !== "failed");
    const remaining = o.total - reserved.reduce((s, r) => s + r.amount, 0);
    if (remaining > 0 && !reserved.some((r) => r.status !== "succeeded"))
      await repo.rpc("commerce_refund_reserve", {
        p_order: o.id,
        p_id: randomUUID(),
        p_amount: remaining,
        p_allocation: {
          products:
            o.subtotal -
            reserved.reduce((s, r) => s + r.allocation.products, 0),
          service:
            o.service_fee -
            reserved.reduce((s, r) => s + r.allocation.service, 0),
          delivery:
            o.delivery_fee -
            reserved.reduce((s, r) => s + r.allocation.delivery, 0),
        },
        p_reason: o.cancellation_reason ?? "AUTOMATIC_CANCELLATION",
        p_actor: "policy:full-cancellation",
        p_party: "unknown",
      });
    pending();
  } else if (
    !["not_started", "failed", "expired", "voided"].includes(
      fresh.payment_status,
    )
  )
    pending();
  if (
    !(await repo.rpc<boolean>("commerce_close_cancellation", { p_order: o.id }))
  )
    pending();
}
async function refund(job: Job, o: CommerceOrder) {
  const repo = orderRepository();
  const { data: r, error } = await repo.db
    .from("refunds")
    .select("*")
    .eq("id", job.reference_id!)
    .single();
  if (error) throw error;
  const a = await currentAttempt(o);
  if (!a.capture_id) throw new ProviderError("capture_missing");
  const key = `refund:${r.id}`;
  const op =
    (await operationFor(key)) ??
    (await prepareOperation(
      job,
      o,
      "refund",
      key,
      {
        path: `/refund/${a.capture_id}`,
        method: "POST",
        parent_id: a.capture_id,
        refund_id: r.id,
        body: { value: r.amount / 100 },
      },
      easypayCommerceConfig().account,
      a.id,
    ));
  // Customer refunds are funded by Ruvon; merchant recovery remains a separate case.
  await run(job, op);
}
async function reconcileDelivery(job: Job, o: CommerceOrder) {
  const repo = orderRepository(),
    provider = new UberDirectProvider();
  const deliveries = await repo.list<{
    provider_delivery_id: string;
    direction: string;
  }>("deliveries", o.id);
  const ids = job.payload.delivery_id
    ? [String(job.payload.delivery_id)]
    : deliveries.map((d) => d.provider_delivery_id);
  for (const id of ids) {
    const d = await provider.read(id);
    await repo.rpc("commerce_apply_delivery", {
      p_order: o.id,
      p_fact: deliveryFact(
        d,
        typeof job.payload.parent_id === "string"
          ? job.payload.parent_id
          : undefined,
      ),
      p_job: job.id,
      p_token: job.lease_token,
    });
  }
}
async function clearing(job: Job, o: CommerceOrder) {
  if (o.operational_status !== "delivered" || o.review_reason) return;
  const store = await storeFor(o);
  if (!store.release_delay_days)
    throw new ProviderError("clearing_schedule_unverified");
  const date = new Date(Date.now() + store.release_delay_days * 86400000)
    .toISOString()
    .slice(0, 10);
  const splits = await orderRepository().list<{
    provider_split_id: string;
    capture_id: string;
    release_revision: number;
    beneficiary: string;
    release_state: string;
  }>("payment_splits", o.id);
  for (const split of splits.filter(
    (s) =>
      !["released", "bank_settlement_pending", "settled"].includes(
        s.release_state,
      ),
  )) {
    const key = `clearing:${split.provider_split_id}:${split.release_revision}`;
    const op =
      (await operationFor(key)) ??
      (await prepareOperation(
        job,
        o,
        "split_schedule",
        key,
        {
          path: `/capture/${split.capture_id}/splits/${split.provider_split_id}`,
          method: "PATCH",
          parent_id: split.capture_id,
          split_id: split.provider_split_id,
          body: { clearing_date: date },
        },
        easypayCommerceConfig().account,
        o.current_attempt_id!,
      ));
    await run(job, op);
  }
}
export async function handleJob(job: Job) {
  if (job.kind === "external_event") {
    await processInbox(job);
    return;
  }
  if (!job.order_id) throw new ProviderError("order_missing");
  const repo = orderRepository(),
    o = await repo.order(job.order_id);
  switch (job.kind) {
    case "authorise":
      return authorise(job, o);
    case "confirm_order":
      return confirm(job, o);
    case "book_delivery":
      return booking(job, o);
    case "cancel_order":
      return cancel(job, o);
    case "refund":
      return refund(job, o);
    case "operation_reconcile": {
      const { data, error } = await repo.db
        .from("provider_operations")
        .select("*")
        .eq("id", job.reference_id!)
        .single();
      if (error) throw error;
      return run(job, data as ProviderOperation);
    }
    case "merchant_timeout":
    case "checkout_expiry":
    case "preparation_overdue":
    case "return_overdue":
      return repo.rpc("commerce_deadline", { p_order: o.id, p_kind: job.kind });
    case "delivery_reconcile":
    case "courier_check":
      return reconcileDelivery(job, o);
    case "schedule_clearing":
      return clearing(job, o);
    case "settlement_reconcile":
      return repo.rpc("commerce_open_case", {
        p_order: o.id,
        p_key: `settlement-evidence:${o.id}`,
        p_type: "settlement",
        p_reason: "SETTLEMENT_EVIDENCE_NEEDS_VERIFICATION",
      });
    case "merchant_notify":
    case "operator_alert":
    case "preparation_reminder":
      return sendNotification(job, o);
    default:
      throw new ProviderError("unknown_job_kind");
  }
}
