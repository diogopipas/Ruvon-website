import "server-only";
import type { CommerceOrder, OrderView } from "@/lib/commerce";
import { commerceDatabase } from "../commerce-config";
import { RequestError } from "../http";
import type { Store } from "./routing";
import type { StoreProduct } from "./pricing";

export function orderRepository() {
  const db = commerceDatabase();
  async function rpc<T>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const { data, error } = await db.rpc(name, args);
    if (error?.code === "40001" || error?.code === "23505")
      throw new RequestError(
        "O pedido mudou. Atualiza antes de continuar.",
        409,
      );
    if (error?.code === "42501")
      throw new RequestError("Acesso não autorizado.", 403);
    if (error?.code === "P0002")
      throw new RequestError("Pedido indisponível.", 404);
    if (error) throw error;
    return data as T;
  }
  async function order(id: string, owner?: string) {
    let query = db
      .from("payment_orders")
      .select("*")
      .eq("flow_version", 2)
      .eq("id", id);
    if (owner) query = query.eq("owner_hash", owner);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data)
      throw new RequestError("Pedido indisponível neste dispositivo.", 404);
    return data as CommerceOrder;
  }
  async function list<T>(table: string, orderId: string) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("order_id", orderId);
    if (error) throw error;
    return data as T[];
  }
  return {
    db,
    rpc,
    order,
    list,
    async stores() {
      const { data, error } = await db
        .from("stores")
        .select("*")
        .eq("enabled", true)
        .order("id");
      if (error) throw error;
      return data as Store[];
    },
    async products(storeId: string) {
      const { data, error } = await db
        .from("store_products")
        .select("*,catalog_skus(*)")
        .eq("store_id", storeId);
      if (error) throw error;
      return data as StoreProduct[];
    },
    async existing(owner: string, key: string) {
      const { data, error } = await db
        .from("payment_orders")
        .select("*")
        .eq("flow_version", 2)
        .eq("owner_hash", owner)
        .eq("checkout_key", key)
        .maybeSingle();
      if (error) throw error;
      return data as CommerceOrder | null;
    },
    async view(o: CommerceOrder): Promise<OrderView> {
      const [deliveries, refunds] = await Promise.all([
        list<{ direction: string; tracking_url: string | null }>(
          "deliveries",
          o.id,
        ),
        list<{ status: string; amount: number }>("refunds", o.id),
      ]);
      return {
        id: o.id,
        operational_status: o.operational_status,
        version: o.version,
        payment_status: o.payment_status,
        merchant_status: o.merchant_status,
        settlement_status: o.settlement_status,
        items: o.items,
        subtotal: o.subtotal,
        delivery_fee: o.delivery_fee,
        service_fee: o.service_fee,
        total: o.total,
        currency: o.currency,
        acceptance_deadline: o.acceptance_deadline,
        created_at: o.created_at,
        quote_expires_at: o.quote_expires_at,
        eta: o.quote_snapshot.eta,
        tracking_url:
          deliveries.find((d) => d.direction === "outbound")?.tracking_url ??
          null,
        refunded: refunds
          .filter((r) => r.status === "succeeded")
          .reduce((s, r) => s + r.amount, 0),
        allowed_actions: ["awaiting_payment", "awaiting_merchant"].includes(
          o.operational_status,
        )
          ? ["cancel"]
          : ["cancelled", "completed"].includes(o.operational_status)
            ? ["report_issue"]
            : ["request_review", "report_issue"],
      };
    },
  };
}
export type OrderRepository = ReturnType<typeof orderRepository>;
