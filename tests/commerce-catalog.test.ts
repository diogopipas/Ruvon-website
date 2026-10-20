import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { commerceCartSchema, quoteSchema, storeSkuId } from "@/lib/commerce";
import { cartSchema } from "@/lib/validation";
import { paymentOrderSchema } from "@/lib/payments";
import { confirmCommerceCart, parseCommerceCart } from "@/lib/commerce-cart";
import {
  buildStoreCatalog,
  priceStoreBasket,
  type StoreProduct,
} from "@/lib/server/orders/pricing";

// Explicitly synthetic stock, not an approved merchant catalogue or seed.
function beer(sku = "brewery-fixture-ipa-330"): StoreProduct {
  return {
    sku,
    price: 537,
    enabled: true,
    stock_on_hand: 8,
    reserved_quantity: 2,
    catalog_skus: {
      name: "IPA de teste",
      unit: "garrafa de 33 cl",
      enabled: true,
      contains_alcohol: true,
      requires_age_verification: true,
      weight_grams: 520,
    },
  };
}

describe("store-owned commerce catalogue", () => {
  it("offers actual store SKUs without invented party packs or private stock fields", () => {
    expect(buildStoreCatalog([beer()], 1000)).toEqual([
      {
        id: "sku:brewery-fixture-ipa-330",
        name: "IPA de teste",
        unit: "garrafa de 33 cl",
        unit_price: 537,
      },
    ]);
    expect(buildStoreCatalog([], 1000)).toEqual([]);
  });

  it("prices physical units from the selected store and snapshots explicit compliance", () => {
    const item = { id: storeSkuId(beer().sku), quantity: 2 };
    const first = priceStoreBasket([item], [beer()], 400);
    expect(first).toMatchObject({
      subtotal: 1074,
      total: 1674,
      contains_alcohol: true,
      requires_age_verification: true,
      required: [{ sku: beer().sku, quantity: 2 }],
      items: [{ name: "IPA de teste", unit_price: 537, line_price: 1074 }],
    });
    const otherStore = { ...beer(), price: 611 };
    expect(priceStoreBasket([item], [otherStore], 400).subtotal).toBe(1222);
    expect(() => priceStoreBasket([item], [], 400)).toThrow("disponível");
    const alcoholFree = beer();
    alcoholFree.catalog_skus.contains_alcohol = false;
    alcoholFree.catalog_skus.requires_age_verification = false;
    expect(priceStoreBasket([item], [alcoholFree], 400)).toMatchObject({
      contains_alcohol: false,
      requires_age_verification: false,
    });
  });

  it("never offers disabled, reserved-out, unpriced or incomplete stock", () => {
    for (const change of [
      { enabled: false },
      { reserved_quantity: 8 },
      { price: 0 },
      { price: 5.37 },
      { catalog_skus: { ...beer().catalog_skus, enabled: false } },
      { catalog_skus: { ...beer().catalog_skus, name: "" } },
      { catalog_skus: { ...beer().catalog_skus, unit: "" } },
    ]) {
      expect(buildStoreCatalog([{ ...beer(), ...change }], 1000)).toEqual([]);
    }
    expect(() =>
      priceStoreBasket(
        [{ id: storeSkuId(beer().sku), quantity: 7 }],
        [beer()],
        0,
      ),
    ).toThrow("stock");
  });

  it("aggregates physical-unit, multipack and configured-pack stock under one SKU", () => {
    const stock = {
      ...beer("super-bock-mini-20"),
      reserved_quantity: 0,
      stock_on_hand: 19,
    };
    const items = commerceCartSchema.parse([
      { id: storeSkuId(stock.sku), quantity: 1 },
      { id: "super-bock-mini-6", quantity: 1 },
      {
        id: "pack-mais-uma",
        quantity: 1,
        options: { ice: "none", snack: "none", water: "none", cups: "none" },
      },
    ]);
    expect(priceStoreBasket(items, [stock], 0).required).toEqual([
      { sku: stock.sku, quantity: 19 },
    ]);
    expect(() =>
      priceStoreBasket(items, [{ ...stock, stock_on_hand: 18 }], 0),
    ).toThrow("stock");
  });

  it("bounds SKU commands and rejects client prices, recipes, options and duplicates", () => {
    const item = { id: storeSkuId(beer().sku), quantity: 1 };
    for (const extra of [
      { price: 1 },
      { name: "Preço inventado" },
      { recipe: [{ sku: "other", quantity: 1 }] },
      { options: { beer: "sagres" } },
    ])
      expect(
        commerceCartSchema.safeParse([{ ...item, ...extra }]).success,
      ).toBe(false);
    for (const id of [
      "unknown",
      "sku:",
      "sku:../secret",
      "sku:a b",
      `sku:${"x".repeat(121)}`,
    ])
      expect(commerceCartSchema.safeParse([{ ...item, id }]).success).toBe(
        false,
      );
    for (const quantity of [0, -1, 1.5, 31])
      expect(
        commerceCartSchema.safeParse([{ ...item, quantity }]).success,
      ).toBe(false);
    expect(commerceCartSchema.safeParse([item, item]).success).toBe(false);
    expect(
      commerceCartSchema.safeParse(
        Array.from({ length: 51 }, (_, n) => ({
          ...item,
          id: storeSkuId(`test-${n}`),
        })),
      ).success,
    ).toBe(false);
  });

  it("accepts store SKUs only in commerce, keeping validation and legacy payments isolated", () => {
    const item = { id: storeSkuId(beer().sku), quantity: 1 };
    expect(
      quoteSchema.safeParse({
        checkout_key: randomUUID(),
        items: [item],
        address: {
          street_address: ["Rua Sintética 1"],
          city: "Lisboa",
          zip_code: "1000-001",
          country: "PT",
        },
      }).success,
    ).toBe(true);
    expect(cartSchema.safeParse([item]).success).toBe(false);
    expect(
      paymentOrderSchema.safeParse({
        checkout_key: randomUUID(),
        items: [item],
        location: { city: "Lisboa" },
        age_confirmed: true,
      }).success,
    ).toBe(false);
  });

  it("restores and clears purchased craft units once while preserving later additions", () => {
    const id = randomUUID(),
      item = { id: storeSkuId(beer().sku), quantity: 4 };
    const cart = parseCommerceCart({
      items: [item, { id: "gelo", quantity: 1 }],
      confirmedOrders: [],
    });
    expect(cart.items).toHaveLength(2);
    const next = confirmCommerceCart(cart, id, [{ ...item, quantity: 2 }]);
    expect(next.items).toEqual([
      { ...item, quantity: 2 },
      { id: "gelo", quantity: 1 },
    ]);
    expect(
      confirmCommerceCart(parseCommerceCart(next), id, [
        { ...item, quantity: 2 },
      ]),
    ).toEqual(next);
  });
});
