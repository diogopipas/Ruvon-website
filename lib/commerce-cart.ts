import { z } from "zod";
import { cartSchema } from "./validation";
import { subtractPurchasedBasket } from "./payments";
import type { CartItem } from "@/types";

const savedCart = z.object({
  items: cartSchema,
  confirmedOrders: z.array(z.uuid()).max(500),
});
export type CommerceCart = z.infer<typeof savedCart>;
export function parseCommerceCart(value: unknown): CommerceCart {
  const parsed = savedCart.safeParse(value);
  if (parsed.success) return parsed.data;
  return { items: [], confirmedOrders: [] };
}
/** Cart quantities and the receipt marker share one localStorage write. */
export function confirmCommerceCart(
  cart: CommerceCart,
  id: string,
  purchased: CartItem[],
): CommerceCart {
  if (cart.confirmedOrders.includes(id)) return cart;
  return {
    items: subtractPurchasedBasket(cart.items, purchased),
    confirmedOrders: [...cart.confirmedOrders, id].slice(-500),
  };
}
