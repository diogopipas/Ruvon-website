import { z } from "zod";
import { cartSchema, locationSchema } from "./validation";
import type { BasketItem, CartItem } from "@/types";

export type PaymentState =
  | "draft"
  | "creating"
  | "pending"
  | "reconciling"
  | "paid"
  | "failed"
  | "expired";

export type PaymentOrderView = {
  id: string;
  state: PaymentState;
  city: string;
  items: BasketItem[];
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  currency: "EUR";
  phone_suffix: string | null;
  expires_at: string | null;
};

export const paymentOrderSchema = z
  .object({
    checkout_key: z.uuid(),
    items: cartSchema.refine(
      (items) => items.length > 0,
      "O carrinho está vazio.",
    ),
    location: locationSchema,
    age_confirmed: z.literal(true, {
      error: "Confirma que tens 18 anos ou mais.",
    }),
  })
  .strict();

export const mbwayPhoneSchema = z
  .string()
  .trim()
  .max(30)
  .transform((value) =>
    value.replace(/[\s()-]/g, "").replace(/^(?:\+351|00351)/, ""),
  )
  .pipe(
    z
      .string()
      .regex(
        /^9[1236]\d{7}$/,
        "Indica um número de telemóvel português válido.",
      ),
  );

export const mbwaySchema = z
  .object({
    phone: mbwayPhoneSchema,
    email: z.union([z.email().max(180), z.literal("")]).optional(),
    retry: z.boolean().default(false),
  })
  .strict();

export function paymentInProgress(state: PaymentState) {
  return state === "creating" || state === "pending" || state === "reconciling";
}

export function cartLineKey(item: CartItem) {
  return `${item.id}:${JSON.stringify(Object.entries(item.options ?? {}).sort(([a], [b]) => a.localeCompare(b)))}`;
}

/** A paid snapshot must never erase another configuration or newly added units. */
export function subtractPurchasedBasket(
  current: CartItem[],
  purchased: CartItem[],
) {
  const quantities = new Map(
    purchased.map((item) => [cartLineKey(item), item.quantity]),
  );
  return current.flatMap((item) => {
    const quantity = item.quantity - (quantities.get(cartLineKey(item)) ?? 0);
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
}

/** Parse provider amounts without accepting rounding, exponents or NaN. */
export function providerCents(value: unknown): number | null {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
