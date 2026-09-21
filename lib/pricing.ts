import { getCatalogItem } from "./products";
import type { BasketItem, CartItem } from "@/types";
export const DELIVERY_FEE = 299;
export const SERVICE_FEE = 89;
export function priceBasket(items: CartItem[]) {
  const lines: BasketItem[] = items.map((item) => {
    const product = getCatalogItem(item.id);
    if (
      !product ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 30
    )
      throw new Error("Artigo inválido.");
    return {
      ...item,
      name: product.name,
      category: "category" in product ? product.category : "packs",
      price: product.price,
    };
  });
  const subtotal = lines.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const delivery_fee = subtotal ? DELIVERY_FEE : 0;
  const service_fee = subtotal ? SERVICE_FEE : 0;
  return {
    items: lines,
    subtotal,
    delivery_fee,
    service_fee,
    total: subtotal + delivery_fee + service_fee,
    item_count: lines.reduce((sum, item) => sum + item.quantity, 0),
  };
}
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
