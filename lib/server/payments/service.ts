import "server-only";
import { randomUUID } from "node:crypto";
import type { CommerceOrder } from "@/lib/commerce";
import { hash } from "../commerce-http";
import { orderRepository } from "../orders/repository";
import { EasypayProvider } from "./easypay";
import { UberDirectProvider } from "../delivery/uber-direct";
import type { ProviderOperation, ProviderFact } from "./provider";
export type Job = {
  id: string;
  kind: string;
  order_id: string | null;
  reference_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  lease_token: string;
  lease_expires_at: string;
  created_at: string;
};
export type Attempt = {
  id: string;
  method: "MBW" | "CC";
  authorisation_id: string | null;
  capture_id: string | null;
  payment_status: string;
  expires_at: string | null;
};
export async function operationFor(key: string) {
  const { data, error } = await orderRepository()
    .db.from("provider_operations")
    .select("*")
    .eq("logical_key", key)
    .maybeSingle();
  if (error) throw error;
  return data as ProviderOperation | null;
}
export async function prepareOperation(
  job: Job,
  order: CommerceOrder,
  kind: ProviderOperation["kind"],
  key: string,
  request: ProviderOperation["request"],
  account: string,
  attemptId?: string,
) {
  const repo = orderRepository();
  const idempotencyKey = kind === "authorise" ? attemptId! : randomUUID();
  const stableRequest = {
    ...request,
    body: {
      ...request.body,
      ...(["capture", "void", "refund"].includes(kind)
        ? { transaction_key: idempotencyKey }
        : {}),
      ...(kind === "delivery_create"
        ? { idempotency_key: idempotencyKey }
        : {}),
    },
  };
  return repo.rpc<ProviderOperation>("commerce_prepare_operation", {
    p_data: {
      provider: kind.startsWith("delivery_") ? "uber" : "easypay",
      account,
      kind,
      order_id: order.id,
      attempt_id: attemptId ?? null,
      logical_key: key,
      idempotency_key: idempotencyKey,
      request: stableRequest,
      request_hash: hash(JSON.stringify(stableRequest)),
    },
    p_job: job.id,
    p_token: job.lease_token,
  });
}
export async function runOperation(
  job: Job,
  op: ProviderOperation,
  hint?: string,
) {
  const repo = orderRepository();
  const provider =
    op.provider === "easypay"
      ? new EasypayProvider()
      : new UberDirectProvider();
  let fact: ProviderFact;
  const terminal = op.status === "succeeded" || op.status === "failed";
  const dispatch =
    !terminal &&
    (await repo.rpc<boolean>("commerce_dispatch_operation", {
      p_operation: op.id,
      p_job: job.id,
      p_token: job.lease_token,
    }));
  if (dispatch) fact = await provider.mutate(op);
  else fact = await provider.reconcile(op, hint);
  await repo.rpc("commerce_apply_operation", {
    p_operation: op.id,
    p_job: job.id,
    p_token: job.lease_token,
    p_fact: fact,
  });
  return fact.state;
}
export async function currentAttempt(order: CommerceOrder) {
  const { data, error } = await orderRepository()
    .db.from("payment_attempts")
    .select("*")
    .eq("id", order.current_attempt_id!)
    .single();
  if (error) throw error;
  return data as Attempt;
}
