import { describe, expect, it } from "vitest";
import { packs } from "@/lib/products";
import { fitsGroup, basketPackEvents, packEvent } from "@/lib/packs";
import { cartSchema, eventSchema } from "@/lib/validation";
import { priceBasket } from "@/lib/pricing";
import { checkoutKey } from "@/lib/journey";
import { summarizePacks } from "@/lib/pack-demand";
import type { Database } from "@/types";
const session = "58cbb87a-13e6-40f3-a988-272c60dbd821";
describe("validation packs", () => {
  it("exposes exactly the six agreed packs and useful group choices", () => {
    expect(packs.map((pack) => pack.name)).toEqual([
      "Só Mais Uma",
      "A Clássica",
      "O Pré",
      "Só Somersby",
      "Gin & Chill",
      "Sem Ressacas",
    ]);
    expect(packs.map((pack) => pack.price)).toEqual([
      2490, 4990, 4490, 3290, 4290, 2990,
    ]);
    for (const group of ["2-3", "4-6", "7+"] as const)
      expect(packs.some((pack) => fitsGroup(pack, group))).toBe(true);
    expect(
      packs.filter((pack) => fitsGroup(pack, "7+")).map((pack) => pack.id),
    ).toEqual(["pack-classica"]);
  });
  it("keeps substitutions in one canonical pack line and through a JSON round trip", () => {
    const cart = cartSchema.parse([
      {
        id: "pack-classica",
        quantity: 2,
        options: { beer: "sagres", mixer: "coca-cola-zero" },
        price: 1,
      },
      { id: "gelo", quantity: 1 },
    ]);
    const basket = priceBasket(JSON.parse(JSON.stringify(cart)));
    expect(basket.items).toHaveLength(2);
    expect(basket).toMatchObject({
      subtotal: 10279,
      total: 10667,
      item_count: 3,
    });
    expect(basket.items[0]).toMatchObject({
      price: 4990,
      product_type: "pack",
      options: { beer: "sagres", mixer: "coca-cola-zero" },
      people_min: 5,
      people_max: 7,
    });
    expect(basket.items[0].contents).toContain("24 × Sagres 33 cl");
    expect(basket.items[0].contents).toContain("2 × Coca-Cola Zero 1,5 L");
  });
  it("rejects invented substitutions and options on individual products", () => {
    for (const item of [
      { id: "pack-classica", options: { beer: "gin" } },
      { id: "pack-somersby", options: { beer: "sagres" } },
      { id: "gelo", options: { mixer: "coca-cola" } },
      { id: "pack-classica", options: { free: true } },
    ])
      expect(cartSchema.safeParse([{ ...item, quantity: 1 }]).success).toBe(
        false,
      );
    expect(
      cartSchema.parse([{ id: "pack-classica", quantity: 1 }])[0].options,
    ).toEqual({ beer: "super-bock", mixer: "coca-cola" });
  });
  it("does not reuse a completed checkout for changed options", () => {
    const original = cartSchema.parse([{ id: "pack-classica", quantity: 1 }]);
    const changed = cartSchema.parse([
      { id: "pack-classica", quantity: 1, options: { beer: "sagres" } },
    ]);
    expect(checkoutKey(original, false)).not.toBe(checkoutKey(changed, false));
  });
  it("accepts full pack metadata for impressions and basket lifecycle events", () => {
    const cart = cartSchema.parse([
      {
        id: "pack-classica",
        quantity: 1,
        options: { mixer: "coca-cola-zero" },
      },
    ]);
    const single = {
      ...packEvent("pack-classica", cart[0].options),
      product: "pack-classica",
    };
    for (const [name, properties] of [
      ["product_viewed", single],
      ["cart_opened", basketPackEvents(cart)],
      ["checkout_started", basketPackEvents(cart)],
      ["waitlist_submitted", basketPackEvents(cart)],
    ] as const) {
      expect(
        eventSchema.parse({
          id: session,
          session_id: session,
          name,
          properties,
        }).properties,
      ).toEqual(properties);
    }
  });
  it("separates pack demand, checkout share, AOV and genuine add-ons", () => {
    const db: Database = {
      leads: [],
      merchant_interests: [],
      simulated_orders: [],
      analytics_events: [],
    };
    const base = {
      id: session,
      created_at: "2026-09-24",
      updated_at: "2026-09-24",
      session_id: session,
      city: "Lisboa",
      postcode: "1000-001",
      reached_checkout: true,
      converted_to_lead: false,
    };
    db.simulated_orders = [
      {
        ...base,
        ...priceBasket([
          { id: "pack-classica", quantity: 1 },
          { id: "gelo", quantity: 1 },
        ]),
      },
      {
        ...base,
        id: "other",
        session_id: "other",
        ...priceBasket([{ id: "gelo", quantity: 1 }]),
      },
    ];
    db.analytics_events = [
      {
        id: "1",
        session_id: session,
        created_at: "2026-09-24T10:00:00Z",
        name: "product_viewed",
        properties: packEvent("pack-classica"),
      },
      {
        id: "2",
        session_id: session,
        created_at: "2026-09-24T10:00:01Z",
        name: "product_added",
        properties: packEvent("pack-classica"),
      },
      {
        id: "3",
        session_id: session,
        created_at: "2026-09-24T10:00:02Z",
        name: "product_added",
        properties: {
          product: "gelo",
          product_type: "individual",
          after_pack: true,
        },
      },
      {
        id: "4",
        session_id: session,
        created_at: "2026-09-24T10:00:03Z",
        name: "pack_group_selected",
        properties: { group_size: "2-3" },
      },
      {
        id: "5",
        session_id: session,
        created_at: "2026-09-24T10:00:04Z",
        name: "pack_group_selected",
        properties: { group_size: "4-6" },
      },
    ];
    expect(summarizePacks(db)).toMatchObject({
      viewRate: 50,
      addRate: 50,
      checkoutShare: 50,
      packAov: 5289,
      nonPackAov: 299,
      groups: [{ name: "4–6", value: 1 }],
      addons: [{ name: "Saco de gelo", value: 1 }],
    });
    expect(summarizePacks(db).packs[0]).toMatchObject({
      id: "pack-classica",
      units: 1,
      checkouts: 1,
    });
  });
});
