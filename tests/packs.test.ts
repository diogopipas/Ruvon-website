import { describe, expect, it } from "vitest";
import { packs, productById } from "@/lib/products";
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
      1470, 5245, 4083, 3115, 3322, 3431,
    ]);
    for (const group of ["2-3", "4-6", "7+"] as const)
      expect(packs.some((pack) => fitsGroup(pack, group))).toBe(true);
    expect(
      packs.filter((pack) => fitsGroup(pack, "7+")).map((pack) => pack.id),
    ).toEqual(["pack-classica"]);
  });
  it("matches each default pack to the listed product values and quantities", () => {
    expect(
      Object.fromEntries(
        [
          "super-bock-mini-6",
          "super-bock-mini-12",
          "super-bock-mini-24",
          "vodka",
          "eristoff",
          "gin",
          "somersby",
          "somersby-8",
          "somersby-16",
          "super-bock-zero",
          "super-bock-zero-12",
          "coca-cola",
          "coca-cola-zero",
          "seven-up",
          "tonic",
          "red-bull-single",
          "red-bull",
          "doritos",
          "pringles",
          "gelo",
          "agua-6",
          "copos-10",
          "copos",
          "limas",
        ].map((id) => [id, productById.get(id)?.price]),
      ),
    ).toEqual({
      "super-bock-mini-6": 375,
      "super-bock-mini-12": 750,
      "super-bock-mini-24": 1499,
      vodka: 2149,
      eristoff: 1569,
      gin: 1749,
      somersby: 499,
      "somersby-8": 998,
      "somersby-16": 1996,
      "super-bock-zero": 599,
      "super-bock-zero-12": 1198,
      "coca-cola": 239,
      "coca-cola-zero": 199,
      "seven-up": 209,
      tonic: 215,
      "red-bull-single": 159,
      "red-bull": 636,
      doritos: 329,
      pringles: 299,
      gelo: 99,
      "agua-6": 192,
      "copos-10": 100,
      copos: 200,
      limas: 108,
    });
    const defaultItems: Record<string, [string, number][]> = {
      "pack-mais-uma": [
        ["super-bock-mini-12", 1],
        ["gelo", 1],
        ["doritos", 1],
        ["agua-6", 1],
        ["copos-10", 1],
      ],
      "pack-classica": [
        ["super-bock-mini-24", 1],
        ["vodka", 1],
        ["coca-cola", 2],
        ["gelo", 1],
        ["doritos", 1],
        ["pringles", 1],
        ["agua-6", 1],
        ["copos", 1],
      ],
      "pack-pre": [
        ["vodka", 1],
        ["red-bull", 1],
        ["coca-cola", 2],
        ["gelo", 1],
        ["doritos", 1],
        ["agua-6", 1],
        ["copos", 1],
      ],
      "pack-somersby": [
        ["somersby-16", 1],
        ["gelo", 1],
        ["doritos", 1],
        ["pringles", 1],
        ["agua-6", 1],
        ["copos", 1],
      ],
      "pack-gin": [
        ["gin", 1],
        ["tonic", 3],
        ["limas", 1],
        ["gelo", 1],
        ["doritos", 1],
        ["agua-6", 1],
        ["copos", 1],
      ],
      "pack-sem-ressacas": [
        ["super-bock-zero-12", 1],
        ["red-bull", 1],
        ["coca-cola", 2],
        ["gelo", 1],
        ["doritos", 1],
        ["pringles", 1],
        ["agua-6", 1],
        ["copos", 1],
      ],
    };
    for (const pack of packs) {
      expect(configurePack(pack).price).toBe(pack.price);
      expect(
        defaultItems[pack.id].reduce(
          (sum, [id, quantity]) => sum + productById.get(id)!.price * quantity,
          0,
        ),
      ).toBe(pack.price);
    }
    expect(configurePack(packs[1]).extras).toContain("1 × Pringles 175 g");
    expect(configurePack(packs[1]).extras).toContain("1 × Doritos 225 g");
    expect(configurePack(packs[1], { snack2: "none" }).price).toBe(4946);
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
      subtotal: 10429,
      total: 10817,
      item_count: 3,
    });
    expect(basket.items[0]).toMatchObject({
      price: 5165,
      product_type: "pack",
      options: { beer: "sagres", mixer: "coca-cola-zero" },
      people_min: 5,
      people_max: 7,
    });
    expect(basket.items[0].contents).toContain("24 × Sagres Mini 20 cl");
    expect(
      basket.items[0].contents?.filter(
        (line) => line === "1 × Coca-Cola Zero 1,75 L",
      ),
    ).toHaveLength(2);
  });
  it("lets A Clássica choose and remove its two soft drinks independently", () => {
    const classica = packs.find((pack) => pack.id === "pack-classica")!;
    expect(classica.extras.slice(0, 2).map((extra) => extra.label)).toEqual([
      "Refrigerante 1 · 1,75 L",
      "Refrigerante 2 · 1,75 L",
    ]);
    expect(configurePack(classica).options).toMatchObject({
      mixer: "coca-cola",
      mixer2: "coca-cola",
    });
    const mixedCart = cartSchema.parse([
      {
        id: classica.id,
        quantity: 1,
        options: { mixer: "seven-up", mixer2: "coca-cola-zero" },
      },
    ]);
    expect(priceBasket(mixedCart).items[0]).toMatchObject({
      price: 5175,
      options: { mixer: "seven-up", mixer2: "coca-cola-zero" },
      extra_contents: expect.arrayContaining([
        "1 × 7Up 1,75 L",
        "1 × Coca-Cola Zero 1,75 L",
      ]),
    });
    const oneRemoved = configurePack(classica, {
      mixer: "none",
      mixer2: "coca-cola",
    });
    expect(oneRemoved.price).toBe(5006);
    expect(oneRemoved.removed).toEqual(["mixer"]);
    expect(oneRemoved.extras).toContain("1 × Coca-Cola Original 1,75 L");
    const change = packChangeEvent(
      classica,
      {},
      { mixer2: "coca-cola-zero" },
      "detail",
    );
    expect(change).toMatchObject({
      changed_options: ["mixer2"],
      price_delta: -0.4,
      changes: [{ option: "mixer2", from: "coca-cola", to: "coca-cola-zero" }],
    });
    expect(
      eventSchema.parse({
        id: session,
        session_id: session,
        name: "pack_options_changed",
        properties: change,
      }).properties,
    ).toEqual(change);
    expect(
      cartSchema.parse([
        { id: classica.id, quantity: 1, options: { mixer: "seven-up" } },
      ])[0].options,
    ).toMatchObject({ mixer: "seven-up", mixer2: "seven-up" });
  });
  it("lets O Pré choose and remove its two soft drinks independently", () => {
    const pre = packs.find((pack) => pack.id === "pack-pre")!;
    expect(pre.extras.slice(0, 2).map((extra) => extra.label)).toEqual([
      "Refrigerante 1 · 1,75 L",
      "Refrigerante 2 · 1,75 L",
    ]);
    expect(configurePack(pre).options).toMatchObject({
      mixer: "coca-cola",
      mixer2: "coca-cola",
    });
    const mixed = configurePack(pre, {
      mixer: "seven-up",
      mixer2: "coca-cola-zero",
    });
    expect(mixed.price).toBe(4013);
    expect(mixed.extras).toEqual(
      expect.arrayContaining(["1 × 7Up 1,75 L", "1 × Coca-Cola Zero 1,75 L"]),
    );
    const mixedCart = cartSchema.parse([
      {
        id: pre.id,
        quantity: 1,
        options: { mixer: "seven-up", mixer2: "coca-cola-zero" },
      },
    ]);
    expect(priceBasket(mixedCart).items[0]).toMatchObject({
      price: 4013,
      options: { mixer: "seven-up", mixer2: "coca-cola-zero" },
      extra_contents: expect.arrayContaining(mixed.extras.slice(0, 2)),
    });
    const reversed = cartSchema.parse([
      {
        id: pre.id,
        quantity: 1,
        options: { mixer: "coca-cola-zero", mixer2: "seven-up" },
      },
    ]);
    expect(checkoutKey(mixedCart, false)).not.toBe(
      checkoutKey(reversed, false),
    );
    const oneRemoved = configurePack(pre, {
      mixer: "coca-cola",
      mixer2: "none",
    });
    expect(oneRemoved.price).toBe(3844);
    expect(oneRemoved.removed).toEqual(["mixer2"]);
    expect(oneRemoved.extras).toContain("1 × Coca-Cola Original 1,75 L");
    expect(configurePack(pre, { mixer: "none", mixer2: "none" }).price).toBe(
      3605,
    );
    const change = packChangeEvent(pre, {}, { mixer2: "seven-up" }, "detail");
    expect(change).toMatchObject({
      changed_options: ["mixer2"],
      price_delta: -0.3,
      changes: [{ option: "mixer2", from: "coca-cola", to: "seven-up" }],
    });
    expect(
      eventSchema.parse({
        id: session,
        session_id: session,
        name: "pack_options_changed",
        properties: change,
      }).properties,
    ).toEqual(change);
    expect(
      cartSchema.parse([
        { id: pre.id, quantity: 1, options: { mixer: "seven-up" } },
      ])[0].options,
    ).toMatchObject({ mixer: "seven-up", mixer2: "seven-up" });
    expect(
      cartSchema.safeParse([
        {
          id: "pack-sem-ressacas",
          quantity: 1,
          options: { mixer2: "seven-up" },
        },
      ]).success,
    ).toBe(false);
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
      vodka: "absolut",
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
      { vodka: "eristoff" },
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
      ["12 × Super Bock Mini 20 cl"],
      ["24 × Super Bock Mini 20 cl", "1 × Absolut Vodka 70 cl"],
      ["1 × Absolut Vodka 70 cl", "4 × Red Bull 25 cl"],
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
    expect(basket.subtotal).toBe(8188);
    expect(basket.total).toBe(8576);
    expect(basket.items[0]).toMatchObject({
      price: 4094,
      removed_extras: ["ice", "water", "cups"],
    });
    expect(basket.items[0].contents).toContain("1 × Smirnoff Vodka 70 cl");
    expect(
      basket.items[0].contents?.filter((line) => line === "1 × 7Up 1,75 L"),
    ).toHaveLength(2);
    expect(basket.items[0].contents).toContain("1 × Pringles 175 g");
    expect(
      basket.items[0].contents?.some((line) => /gelo|água|copos/.test(line)),
    ).toBe(false);
  });
  it("records removal, restore and swap actions with previous and current prices", () => {
    const pack = packs.find((pack) => pack.id === "pack-classica")!;
    const removal = packChangeEvent(pack, {}, { ice: "none" }, "detail");
    expect(removal).toMatchObject({
      price_delta: -0.99,
      pack_price: 51.46,
      default_pack_price: 52.45,
      removed_extras: ["ice"],
      changes: [
        { option: "ice", from: "included", to: "none", action: "removed" },
      ],
    });
    expect(
      packChangeEvent(pack, { ice: "none" }, {}, "cart").changes[0].action,
    ).toBe("restored");
    expect(
      packChangeEvent(pack, {}, { vodka: "eristoff" }, "detail").price_delta,
    ).toBe(-5.8);
    expect(
      packChangeEvent(pack, {}, { vodka: "smirnoff" }, "detail").price_delta,
    ).toBe(-5.7);
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
        option: "1 saco de gelo · 2 kg",
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
      packAov: 5344,
      nonPackAov: 99,
      groups: [{ name: "4–6", value: 1 }],
      addons: [{ name: "Saco de gelo", value: 1 }],
    });
    expect(summarizePacks(db).packs[0]).toMatchObject({
      id: "pack-classica",
      units: 1,
      checkouts: 1,
      carts: 1,
      checkoutRate: 100,
    });
  });
  it("uses saved pack choices when impression events are missing", () => {
    const basket = priceBasket([
      {
        id: "pack-classica",
        quantity: 2,
        options: {
          beer: "sagres",
          mixer: "seven-up",
          mixer2: "none",
          ice: "none",
          water: "none",
          cups: "none",
        },
      },
    ]);
    const db: Database = {
      leads: [],
      merchant_interests: [],
      analytics_events: [],
      simulated_orders: [
        {
          id: session,
          session_id: session,
          created_at: "2026-09-24",
          updated_at: "2026-09-24",
          city: "Faro",
          postcode: "",
          ...basket,
          reached_checkout: true,
          converted_to_lead: false,
        },
      ],
    };
    const demand = summarizePacks(db);
    expect(demand).toMatchObject({
      viewed: 1,
      added: 1,
      viewRate: 100,
      addRate: 100,
      cartShare: 100,
      checkoutShare: 100,
      packAov: basket.subtotal,
    });
    expect(demand.removedExtras).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 2 })]),
    );
    expect(demand.swaps).toEqual(
      expect.arrayContaining([
        { name: "Super Bock → Sagres", value: 2 },
        { name: "Coca-Cola → 7Up", value: 2 },
      ]),
    );
    expect(demand.selectedExtras.some((row) => row.name.includes("7Up"))).toBe(
      true,
    );
  });
});
