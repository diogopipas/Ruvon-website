import type { Allocation, CommerceLine } from "@/lib/commerce";
import type { CartItem } from "@/types";
import { getCatalogItem } from "@/lib/products";
import { aggregateRecipe, resolveRecipe } from "./recipes";

export type StoreProduct = {
  sku: string;
  price: number;
  enabled: boolean;
  stock_on_hand: number;
  reserved_quantity: number;
  catalog_skus: {
    enabled: boolean;
    contains_alcohol: boolean;
    requires_age_verification: boolean;
    weight_grams: number;
  };
};
export function allocate(
  products: number,
  delivery: number,
  service: number,
  commissionBps: number,
): Allocation {
  for (const value of [products, delivery, service, commissionBps])
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("Valor inválido.");
  if (commissionBps > 10000 || products + service + delivery > 99_999_999)
    throw new Error("Valor fora do limite.");
  const commission = Math.floor((products * commissionBps + 5000) / 10000);
  return {
    commission_bps: commissionBps,
    products,
    commission,
    merchant: products - commission,
    service,
    delivery,
    ruvon: commission + service + delivery,
    total: products + service + delivery,
  };
}
export function priceStoreBasket(
  items: CartItem[],
  products: StoreProduct[],
  delivery: number,
  service = 200,
  commissionBps = 1000,
) {
  const catalog = new Map(products.map((p) => [p.sku, p]));
  const lines: CommerceLine[] = items.map((item) => {
    const recipe = resolveRecipe(item);
    const components = recipe.map((part) => {
      const product = catalog.get(part.sku);
      if (
        !product?.enabled ||
        !product.catalog_skus.enabled ||
        !Number.isSafeInteger(product.price) ||
        product.price < 0
      )
        throw new Error("Um artigo não está disponível nesta loja.");
      return { ...part, unit_price: product.price };
    });
    const unit_price = components.reduce(
      (sum, c) => sum + c.quantity * c.unit_price,
      0,
    );
    return {
      ...item,
      name: getCatalogItem(item.id)!.name,
      unit_price,
      line_price: unit_price * item.quantity,
      recipe,
      components,
    };
  });
  const required = aggregateRecipe(
    lines.flatMap((l) =>
      l.recipe.map((p) => ({ ...p, quantity: p.quantity * l.quantity })),
    ),
  );
  for (const part of required) {
    const product = catalog.get(part.sku)!;
    if (product.stock_on_hand - product.reserved_quantity < part.quantity)
      throw new Error("Um artigo ficou sem stock. Revê o carrinho.");
  }
  const subtotal = lines.reduce((sum, l) => sum + l.line_price, 0);
  if (subtotal <= 0) throw new Error("Carrinho inválido.");
  return {
    items: lines,
    required,
    subtotal,
    delivery_fee: delivery,
    service_fee: service,
    total: subtotal + delivery + service,
    allocation: allocate(subtotal, delivery, service, commissionBps),
    contains_alcohol: required.some(
      (r) => catalog.get(r.sku)!.catalog_skus.contains_alcohol,
    ),
    requires_age_verification: required.some(
      (r) => catalog.get(r.sku)!.catalog_skus.requires_age_verification,
    ),
  };
}
