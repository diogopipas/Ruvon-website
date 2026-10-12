import "server-only";
import { orderRepository } from "../orders/repository";
import { staffSession } from "../merchant/auth";
import { RequestError } from "../http";
export async function operationalOrders() {
  await staffSession(true);
  const { data, error } = await orderRepository()
    .db.from("commerce_operations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}
export async function orderOperations(id: string) {
  await staffSession(true);
  const repo = orderRepository();
  const order = await repo.order(id);
  const [events, cases, refunds, operations, jobs, splits, deliveries] =
    await Promise.all([
      repo.list("order_events", id),
      repo.list("order_cases", id),
      repo.list<{
        status: string;
        amount: number;
        allocation: { products: number; service: number; delivery: number };
      }>("refunds", id),
      repo.list("provider_operations", id),
      repo.list("background_jobs", id),
      repo.list("payment_splits", id),
      repo.list("deliveries", id),
    ]);
  return {
    order: await repo.view(order),
    events,
    cases,
    refunds,
    operations: operations.map((op) => {
      const o = op as Record<string, unknown>;
      return {
        id: o.id,
        kind: o.kind,
        status: o.status,
        provider_resource_id: o.provider_resource_id,
        error_class: o.error_class,
        created_at: o.created_at,
      };
    }),
    jobs: jobs.map((j) => {
      const v = j as Record<string, unknown>;
      return {
        id: v.id,
        kind: v.kind,
        state: v.state,
        attempts: v.attempts,
        last_error: v.last_error,
      };
    }),
    splits,
    deliveries,
    remaining_components: {
      products:
        order.subtotal -
        refunds
          .filter((r) => r.status !== "failed")
          .reduce((s, r) => s + r.allocation.products, 0),
      service:
        order.service_fee -
        refunds
          .filter((r) => r.status !== "failed")
          .reduce((s, r) => s + r.allocation.service, 0),
      delivery:
        order.delivery_fee -
        refunds
          .filter((r) => r.status !== "failed")
          .reduce((s, r) => s + r.allocation.delivery, 0),
    },
    remaining_refundable:
      order.payment_status === "paid"
        ? order.total -
          refunds
            .filter((r) => r.status !== "failed")
            .reduce((s, r) => s + r.amount, 0)
        : 0,
  };
}
export async function adminCommand(
  args: Record<string, unknown>,
  name: "operations_command" | "operations_resolve_case" = "operations_command",
) {
  const { client } = await staffSession(true);
  const { data, error } = await client.rpc(name, args);
  if (error?.code === "40001" || error?.code === "23505")
    throw new RequestError("O pedido mudou. Atualiza antes de continuar.", 409);
  if (error?.code === "42501")
    throw new RequestError("Acesso não autorizado.", 403);
  if (error) throw error;
  return data;
}
