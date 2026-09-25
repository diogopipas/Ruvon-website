import { describe, expect, it } from "vitest";
import { packs } from "@/lib/products";
import {
  configurePack,
  packChangeEvent,
  fitsGroup,
  basketPackEvents,
  packEvent,
} from "@/lib/packs";
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
      2190, 5990, 3990, 3490, 3990, 3490,
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
      subtotal: 12279,
      total: 12667,
      item_count: 3,
    });
    expect(basket.items[0]).toMatchObject({
      price: 5990,
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
    ).toMatchObject({
      beer: "super-bock",
      mixer: "coca-cola",
      vodka: "eristoff",
      ice: "included",
    });
  });
  it("does not reuse a completed checkout for changed options", () => {
    const original = cartSchema.parse([{ id: "pack-classica", quantity: 1 }]);
    const changed = cartSchema.parse([
      { id: "pack-classica", quantity: 1, options: { beer: "sagres" } },
    ]);
    expect(checkoutKey(original, false)).not.toBe(checkoutKey(changed, false));
    for (const options of [
      { vodka: "smirnoff" },
      { ice: "none" },
      { snack: "pringles" },
      { cups: "none" },
    ]) {
      const customized = cartSchema.parse([
        { id: "pack-classica", quantity: 1, options },
      ]);
      expect(checkoutKey(original, false)).not.toBe(
        checkoutKey(customized, false),
      );
    }
  });
  it("keeps every core intact when all extras are removed", () => {
    expect(packs.filter((pack) => pack.tier === "primary")).toHaveLength(4);
    expect(packs.filter((pack) => pack.tier === "secondary")).toHaveLength(2);
    const expected = [
      ["12 × Super Bock 33 cl"],
      ["24 × Super Bock 33 cl", "1 × Eristoff Vodka 70 cl"],
      ["1 × Eristoff Vodka 70 cl", "4 × Red Bull 25 cl"],
      ["16 × Somersby Maçã 33 cl"],
      ["1 × Gordon’s London Dry Gin 70 cl", "3 × Schweppes Tónica 1 L"],
      ["12 × Super Bock 0.0 33 cl", "4 × Red Bull 25 cl"],
    ];
    packs.forEach((pack, index) => {
      const options = Object.fromEntries(
        pack.extras.map((extra) => [extra.key, "none"]),
      );
      const selection = configurePack(pack, options);
      expect(selection.core).toEqual(expected[index]);
      expect(selection.extras).toEqual([]);
      expect(selection.price).toBeGreaterThan(0);
      expect(selection.price).toBe(
        pack.price -
          pack.extras.reduce((sum, extra) => sum + extra.choices[0].price, 0),
      );
      for (const core of pack.core.filter((part) => part.key)) {
        expect(
          cartSchema.safeParse([
            { id: pack.id, quantity: 1, options: { [core.key!]: "none" } },
          ]).success,
        ).toBe(false);
      }
    });
  });
  it("prices combined swaps and removals without trusting client money", () => {
    const items = cartSchema.parse([
      {
        id: "pack-classica",
        quantity: 2,
        options: {
          beer: "sagres",
          vodka: "smirnoff",
          mixer: "seven-up",
          snack: "pringles",
          ice: "none",
          water: "none",
          cups: "none",
        },
        price: -999,
        subtotal: 1,
      },
    ]);
    const basket = priceBasket(items);
    expect(basket.subtotal).toBe(11130);
    expect(basket.total).toBe(11518);
    expect(basket.items[0]).toMatchObject({
      price: 5565,
      removed_extras: ["ice", "cups", "water"],
    });
    expect(basket.items[0].contents).toContain("1 × Smirnoff Vodka 70 cl");
    expect(basket.items[0].contents).toContain("2 × 7Up 1,5 L");
    expect(basket.items[0].contents).toContain("2 × Pringles Original 165 g");
    expect(
      basket.items[0].contents?.some((line) => /gelo|água|copos/.test(line)),
    ).toBe(false);
  });
  it("records removal, restore and swap actions with previous and current prices", () => {
    const pack = packs.find((pack) => pack.id === "pack-classica")!;
    const removal = packChangeEvent(pack, {}, { ice: "none" }, "detail");
    expect(removal).toMatchObject({
      price_delta: -3,
      pack_price: 56.9,
      default_pack_price: 59.9,
      removed_extras: ["ice"],
      changes: [
        { option: "ice", from: "included", to: "none", action: "removed" },
      ],
    });
    expect(
      packChangeEvent(pack, { ice: "none" }, {}, "cart").changes[0].action,
    ).toBe("restored");
    expect(
      packChangeEvent(pack, {}, { vodka: "smirnoff" }, "detail").price_delta,
    ).toBe(2);
    const parsed = eventSchema.parse({
      id: session,
      session_id: session,
      name: "pack_options_changed",
      properties: removal,
    });
    expect(parsed.properties).toEqual(removal);
    const db: Database = {
      leads: [],
      simulated_orders: [],
      merchant_interests: [],
      analytics_events: [
        {
          id: session,
          session_id: session,
          created_at: "2026-09-24T10:00:00Z",
          name: "pack_options_changed",
          properties: removal,
        },
      ],
    };
    expect(summarizePacks(db).customizations).toEqual([
      {
        pack: "A Clássica",
        option: "2 sacos de gelo · 2 kg",
        from: "Manter",
        to: "Sem",
        source: "A explorar",
        count: 1,
      },
    ]);
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
      packAov: 6289,
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
