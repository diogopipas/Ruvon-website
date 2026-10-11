import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { PaymentOrderView, PaymentState } from "@/lib/payments";
import { priceBasket } from "@/lib/pricing";
import type { z } from "zod";
import type { paymentOrderSchema } from "@/lib/payments";
import { RequestError } from "./http";
import { sandboxDatabaseConfig } from "./payment-config";
import { fetchWithTimeout } from "./supabase";

export type PaymentOrder = Omit<
  PaymentOrderView,
  "phone_suffix" | "expires_at"
> & {
  owner_hash: string;
  snapshot_hash: string;
  checkout_key: string;
  current_attempt_id: string | null;
};
export type PaymentAttempt = {
  id: string;
  order_id: string;
  phone: string;
  email: string | null;
  state: Exclude<PaymentState, "draft">;
  created_at: string;
  provider_id: string | null;
  expires_at: string | null;
};
export const hashPaymentOwner = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function paymentStore() {
  const { url, key } = sandboxDatabaseConfig();
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetchWithTimeout(input, init, 5000) },
  });
  return {
    async create(input: z.infer<typeof paymentOrderSchema>, ownerHash: string) {
      const priced = priceBasket(input.items);
      if (priced.total > 99_999_999)
        throw new RequestError(
          "O valor do carrinho ultrapassa o limite de pagamento.",
        );
      const snapshotHash = createHash("sha256")
        .update(JSON.stringify({ ...priced, city: input.location.city }))
        .digest("hex");
      const { data, error } = await db.rpc("create_payment_order", {
        p_data: {
          ...priced,
          city: input.location.city,
          owner_hash: ownerHash,
          checkout_key: input.checkout_key,
          snapshot_hash: snapshotHash,
        },
      });
      if (error?.code === "23505")
        throw new RequestError(
          "O carrinho mudou. Revê o total antes de pagar.",
          409,
        );
      if (error) throw error;
      return data as PaymentOrder;
    },
    async owned(id: string, ownerHash: string) {
      const { data, error } = await db
        .from("payment_orders")
        .select("*")
        .eq("id", id)
        .eq("owner_hash", ownerHash)
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new RequestError("Pedido indisponível neste dispositivo.", 404);
      return data as PaymentOrder;
    },
    async attempt(id: string) {
      const { data, error } = await db
        .from("payment_attempts")
        .select("*,order:payment_orders(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as (PaymentAttempt & { order: PaymentOrder }) | null;
    },
    async start(
      order: PaymentOrder,
      phone: string,
      email: string | undefined,
      retry: boolean,
    ) {
      const { data, error } = await db.rpc("start_mbway_attempt", {
        p_order_id: order.id,
        p_owner_hash: order.owner_hash,
        p_phone: phone,
        p_email: email ?? "",
        p_retry: retry,
      });
      if (error) throw error;
      return data as { attempt: PaymentAttempt; should_create: boolean };
    },
    async settle(
      attempt: PaymentAttempt,
      state: Exclude<PaymentState, "draft" | "creating">,
      providerId: string | null = attempt.provider_id,
      expiresAt: string | null = null,
    ) {
      const { data, error } = await db.rpc("settle_mbway_attempt", {
        p_attempt_id: attempt.id,
        p_provider_id: providerId,
        p_state: state,
        p_expires_at: expiresAt,
      });
      if (error) throw error;
      return data as PaymentAttempt;
    },
    async claimCheck(id: string) {
      const { data, error } = await db.rpc("claim_mbway_check", {
        p_attempt_id: id,
      });
      if (error) throw error;
      return data === true;
    },
  };
}

export function paymentView(
  order: PaymentOrder,
  attempt: PaymentAttempt | null,
): PaymentOrderView {
  return {
    id: order.id,
    state: order.state,
    city: order.city,
    items: order.items,
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    service_fee: order.service_fee,
    total: order.total,
    currency: "EUR",
    phone_suffix: attempt?.phone.slice(-3) ?? null,
    expires_at: attempt?.expires_at ?? null,
  };
}
