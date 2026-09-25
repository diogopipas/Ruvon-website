import { afterEach, describe, expect, it } from "vitest";
import { priceBasket } from "@/lib/pricing";
import {
  contactSchema,
  leadSchema,
  locationSchema,
  orderSchema,
} from "@/lib/validation";
import { summarize } from "@/lib/dashboard";
import { products, packs } from "@/lib/products";
import { getSiteUrl } from "@/lib/site-url";
import type { Database, SimulatedOrder } from "@/types";
const session = "58cbb87a-13e6-40f3-a988-272c60dbd821";
const items = [
  { id: "super-bock", quantity: 1 },
  { id: "gelo", quantity: 1 },
  { id: "coca-cola", quantity: 1 },
  { id: "doritos", quantity: 1 },
];
describe("prices and catalog", () => {
  it("prices the exact acceptance basket in integer cents", () => {
    expect(priceBasket(items)).toMatchObject({
      subtotal: 1316,
      delivery_fee: 299,
      service_fee: 89,
      total: 1704,
      item_count: 4,
    });
  });
  it("does not charge fees for an empty cart", () => {
    expect(priceBasket([])).toMatchObject({
      subtotal: 0,
      total: 0,
      delivery_fee: 0,
      service_fee: 0,
    });
  });
  it("prices a bundle as one catalog item", () => {
    expect(priceBasket([{ id: "pack-classica", quantity: 2 }])).toMatchObject({
      subtotal: 9330,
      total: 9718,
      item_count: 2,
    });
  });
  it("rejects unknown products, negative quantities and fractional quantities", () => {
    expect(() => priceBasket([{ id: "missing", quantity: 1 }])).toThrow();
    for (const quantity of [-1, 0, 1.5, 31])
      expect(() => priceBasket([{ id: "gelo", quantity }])).toThrow();
  });
  it("has unique ids and valid pack illustration references", () => {
    expect(products).toHaveLength(42);
    expect(packs).toHaveLength(6);
    expect(new Set([...products, ...packs].map((p) => p.id)).size).toBe(48);
    for (const pack of packs)
      for (const id of pack.items)
        expect(products.some((p) => p.id === id)).toBe(true);
  });
});
describe("server input boundaries", () => {
  it.each(["1000001", "1000 001", "1000-001", " 1000 - 001 "])(
    "normalizes Portuguese postcode %s",
    (postcode) => {
      expect(locationSchema.parse({ city: " Lisboa ", postcode })).toEqual({
        city: "Lisboa",
        postcode: "1000-001",
      });
    },
  );
  it.each([
    "teste@example.com",
    "912 345 678",
    "+351 912345678",
    "00351 912345678",
    "212345678",
  ])("accepts valid Portuguese contact %s", (contact) =>
    expect(contactSchema.safeParse(contact).success).toBe(true),
  );
  it.each(["not-an-email", "12345", "+1 5551234567", ""])(
    "rejects invalid contact %s",
    (contact) => expect(contactSchema.safeParse(contact).success).toBe(false),
  );
  it("requires consent and a Portuguese postcode", () => {
    const input = {
      session_id: session,
      items,
      contact: "teste@example.com",
      location: { city: "Lisboa", postcode: "1000-001" },
      consent: true,
    };
    expect(leadSchema.safeParse(input).success).toBe(true);
    expect(leadSchema.safeParse({ ...input, consent: false }).success).toBe(
      false,
    );
    expect(
      leadSchema.safeParse({
        ...input,
        location: { city: "Lisboa", postcode: "1000" },
      }).success,
    ).toBe(false);
    expect(leadSchema.safeParse({ ...input, website: "spam" }).success).toBe(
      false,
    );
  });
  it("strips submitted prices and rejects duplicate items", () => {
    const parsed = orderSchema.parse({
      session_id: session,
      items: [{ id: "gelo", quantity: 1, price: 1 }],
      total: 1,
    });
    expect(parsed.items[0]).toEqual({ id: "gelo", quantity: 1 });
    expect("total" in parsed).toBe(false);
    expect(
      orderSchema.safeParse({
        session_id: session,
        items: [items[0], items[0]],
      }).success,
    ).toBe(false);
  });
});
describe("demand metrics", () => {
  it("deduplicates visitor sessions and geographic demand; city waitlists do not inflate order conversion", () => {
    const priced = priceBasket(items);
    const order: SimulatedOrder = {
      id: session,
      session_id: session,
      created_at: "2026-09-21",
      updated_at: "2026-09-21",
      city: "Lisboa",
      postcode: "1000-001",
      ...priced,
      converted_to_lead: true,
      reached_checkout: true,
      utm_campaign: "night",
      utm_source: "instagram",
    };
    const lead = {
      id: "lead1",
      session_id: session,
      created_at: "2026-09-21",
      email: "one@example.com",
      phone: null,
      city: "Lisboa",
      postcode: "1000-001",
      basket_total: 1704,
      basket_items: priced.items,
      consent_at: "2026-09-21",
      utm_campaign: "night",
      utm_source: "instagram",
    };
    const db: Database = {
      simulated_orders: [order],
      leads: [
        lead,
        {
          ...lead,
          id: "lead2",
          session_id: "another",
          basket_items: [],
          basket_total: 0,
        },
      ],
      merchant_interests: [],
      analytics_events: [
        {
          id: "e1",
          session_id: session,
          created_at: "2026-09-21",
          name: "landing_view",
          properties: {},
        },
        {
          id: "e2",
          session_id: session,
          created_at: "2026-09-21",
          name: "landing_view",
          properties: {},
        },
      ],
    };
    expect(summarize(db)).toMatchObject({
      visitors: 1,
      started: 1,
      checkout: 1,
      leads: 2,
      gmv: 1704,
      average: 1316,
      conversion: 100,
    });
    expect(summarize(db).locations[0]).toMatchObject({ demand: 2, leads: 2 });
    expect(summarize(db).campaigns[0]).toMatchObject({
      orders: 1,
      checkout: 1,
      converted: 1,
      leads: 2,
      conversion: 100,
    });
  });
  it("measures saved basket intent and dropoff without inflated click counts or homepage cohorts", () => {
    const priced = priceBasket([{ id: "gelo", quantity: 2 }]);
    const order: SimulatedOrder = {
      id: session,
      session_id: session,
      created_at: "2026-09-21",
      updated_at: "2026-09-21",
      city: "Lisboa",
      postcode: "1000-001",
      ...priced,
      reached_checkout: true,
      converted_to_lead: true,
      utm_campaign: "night",
    };
    const db: Database = {
      simulated_orders: [
        order,
        { ...order, id: "two", session_id: "two", converted_to_lead: false },
        {
          ...order,
          id: "three",
          session_id: "three",
          reached_checkout: false,
          converted_to_lead: false,
          ...priceBasket([]),
        },
      ],
      leads: [
        {
          id: "converted-lead",
          session_id: session,
          created_at: order.created_at,
          email: "converted@example.com",
          phone: null,
          city: order.city,
          postcode: order.postcode,
          basket_total: order.total,
          basket_items: order.items,
          consent_at: order.created_at,
          utm_campaign: order.utm_campaign,
        },
      ],
      merchant_interests: [],
      analytics_events: Array.from({ length: 12 }, (_, index) => ({
        id: String(index),
        session_id: session,
        created_at: "2026-09-21",
        name: "product_added",
        properties: { product: "gelo", category: "gelo", quantity: 1 },
      })),
    };
    const stats = summarize(db);
    expect(stats).toMatchObject({
      visitors: 0,
      started: 3,
      checkout: 2,
      converted: 1,
      beforeCheckout: 1,
      withoutContact: 1,
      checkoutConversion: 50,
      products: [
        { name: products.find((item) => item.id === "gelo")!.name, value: 4 },
      ],
    });
    expect(stats.conversion).toBeCloseTo(100 / 3);
    expect(stats.campaigns[0]).toMatchObject({
      orders: 3,
      checkout: 2,
      converted: 1,
    });
    expect(stats.campaigns[0].conversion).toBeCloseTo(100 / 3);
  });
  it("reports an empty dashboard without NaN conversion rates", () => {
    expect(
      summarize({
        leads: [],
        simulated_orders: [],
        merchant_interests: [],
        analytics_events: [],
      }),
    ).toMatchObject({
      started: 0,
      checkout: 0,
      converted: 0,
      beforeCheckout: 0,
      withoutContact: 0,
      checkoutConversion: 0,
      conversion: 0,
      average: 0,
      campaigns: [],
      products: [],
    });
  });
  it.each([
    {
      utm_campaign: "returning",
      utm_source: "instagram",
      utm_medium: "paid_social",
    },
    {
      utm_campaign: "original",
      utm_source: "newsletter",
      utm_medium: "paid_social",
    },
    {
      utm_campaign: "original",
      utm_source: "instagram",
      utm_medium: "organic",
    },
  ])(
    "does not credit a previous signup to a later campaign visit: %j",
    (laterAttribution) => {
      const priced = priceBasket([{ id: "gelo", quantity: 1 }]);
      const originalAttribution = {
        utm_campaign: "original",
        utm_source: "instagram",
        utm_medium: "paid_social",
      };
      const order: SimulatedOrder = {
        id: session,
        session_id: session,
        created_at: "2026-09-21",
        updated_at: "2026-09-22",
        city: "Lisboa",
        postcode: "1000-001",
        ...priced,
        reached_checkout: true,
        converted_to_lead: true,
        ...laterAttribution,
      };
      const stats = summarize({
        simulated_orders: [order],
        leads: [
          {
            id: "original-lead",
            session_id: session,
            created_at: order.created_at,
            email: "converted@example.com",
            phone: null,
            city: order.city,
            postcode: order.postcode,
            basket_total: order.total,
            basket_items: order.items,
            consent_at: order.created_at,
            ...originalAttribution,
          },
        ],
        merchant_interests: [],
        analytics_events: [],
      });
      expect(stats).toMatchObject({
        started: 1,
        converted: 1,
        conversion: 100,
      });
      expect(stats.campaigns.find((row) => row.orders === 1)).toMatchObject({
        checkout: 1,
        leads: 0,
        converted: 0,
        conversion: 0,
      });
      expect(stats.campaigns.find((row) => row.leads === 1)).toMatchObject({
        name: "original",
        orders: 0,
        converted: 0,
      });
    },
  );
});

describe("deployment URL", () => {
  const original = {
    site: process.env.NEXT_PUBLIC_SITE_URL,
    vercel: process.env.VERCEL_URL,
    production: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    isVercel: process.env.VERCEL,
  };

  function restore(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  afterEach(() => {
    restore("NEXT_PUBLIC_SITE_URL", original.site);
    restore("VERCEL_URL", original.vercel);
    restore("VERCEL_PROJECT_PRODUCTION_URL", original.production);
    restore("VERCEL", original.isVercel);
  });

  it("normalizes a localhost URL without a protocol", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "localhost:3000";
    delete process.env.VERCEL;
    expect(getSiteUrl().toString()).toBe("http://localhost:3000/");
  });

  it("uses Vercel's generated URL instead of localhost in a deployment", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "localhost:3000";
    process.env.VERCEL = "1";
    process.env.VERCEL_URL = "jola-preview.vercel.app";
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(getSiteUrl().toString()).toBe("https://jola-preview.vercel.app/");
  });

  it("preserves a configured production domain", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://jola.pt";
    process.env.VERCEL = "1";
    process.env.VERCEL_URL = "jola-preview.vercel.app";
    expect(getSiteUrl().toString()).toBe("https://jola.pt/");
  });
});
