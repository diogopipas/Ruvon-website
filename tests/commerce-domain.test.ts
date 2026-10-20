import { describe, it, expect } from "vitest";
import {
  allocate,
  priceStoreBasket,
  type StoreProduct,
} from "@/lib/server/orders/pricing";
import { resolveRecipe } from "@/lib/server/orders/recipes";
import {
  eligibleStore,
  storeOpen,
  type Store,
} from "@/lib/server/orders/routing";
import { canTransition } from "@/lib/server/orders/state-machine";
import { cartSchema } from "@/lib/validation";

describe("financial and physical transition guards", () => {
  it("requires a fully confirmed refund and safely closed delivery before cancellation", () => {
    const facts = {
      payment: "paid" as const,
      capturedCents: 4600,
      refundedCents: 4600,
      delivery: "canceled",
    };
    expect(canTransition("cancelling", "cancelled", facts)).toBe(true);
    expect(
      canTransition("cancelling", "cancelled", {
        ...facts,
        refundedCents: 4500,
      }),
    ).toBe(false);
    expect(
      canTransition("cancelling", "cancelled", {
        ...facts,
        delivery: "pickup",
      }),
    ).toBe(false);
    expect(
      canTransition("cancelling", "cancelled", {
        ...facts,
        payment: "unknown",
      }),
    ).toBe(false);
  });
  it("distinguishes return completion from a successful customer handoff", () => {
    const facts = {
      payment: "paid" as const,
      delivery: "delivered",
      deliveryDirection: "return" as const,
    };
    expect(canTransition("returning", "returned", facts)).toBe(true);
    expect(canTransition("in_delivery", "delivered", facts)).toBe(false);
    expect(
      canTransition("returning", "returned", {
        ...facts,
        deliveryDirection: "outbound",
      }),
    ).toBe(false);
  });
  it("blocks preparation after pickup and completion before verified settlement", () => {
    expect(
      canTransition("confirming", "preparing", {
        payment: "paid",
        delivery: "delivered",
      }),
    ).toBe(false);
    expect(
      canTransition("in_delivery", "delivered", {
        payment: "unknown",
        delivery: "delivered",
      }),
    ).toBe(false);
    expect(
      canTransition("delivered", "completed", {
        payment: "paid",
        settlement: "scheduled",
      }),
    ).toBe(false);
    expect(
      canTransition("delivered", "completed", {
        payment: "paid",
        settlement: "settled",
      }),
    ).toBe(true);
  });
});
const stock = (sku: string, price = 100, quantity = 100): StoreProduct => ({
  sku,
  price,
  enabled: true,
  stock_on_hand: quantity,
  reserved_quantity: 0,
  catalog_skus: {
    name: `Artigo sintético ${sku}`,
    unit: "unidade",
    enabled: true,
    contains_alcohol: sku.includes("mini"),
    requires_age_verification: sku.includes("mini"),
    weight_grams: 200,
  },
});
describe("commercial snapshots and stock recipes", () => {
  it("rounds commission once and preserves every cent", () => {
    expect(allocate(4000, 400, 200, 1000)).toEqual({
      commission_bps: 1000,
      products: 4000,
      commission: 400,
      merchant: 3600,
      service: 200,
      delivery: 400,
      ruvon: 1000,
      total: 4600,
    });
    expect(allocate(1005, 0, 200, 1000).commission).toBe(101);
    for (let p = 1; p < 10000; p += 7) {
      const a = allocate(p, 319, 200, 1375);
      expect(a.merchant + a.ruvon).toBe(a.total);
    }
    expect(() => allocate(999999999, 0, 0, 1000)).toThrow();
  });
  it("uses explicit recipes and shares mini stock between packs and multipacks", () => {
    const items = cartSchema.parse([
      {
        id: "pack-mais-uma",
        quantity: 1,
        options: { ice: "none", snack: "none", water: "none", cups: "none" },
      },
      { id: "super-bock-mini-6", quantity: 1 },
    ]);
    const priced = priceStoreBasket(
      items,
      [stock("super-bock-mini-20", 63, 18)],
      400,
    );
    expect(priced.subtotal).toBe(18 * 63);
    expect(priced.required).toEqual([
      { sku: "super-bock-mini-20", quantity: 18 },
    ]);
    expect(priced.contains_alcohol).toBe(true);
    expect(() =>
      priceStoreBasket(items, [stock("super-bock-mini-20", 63, 17)], 400),
    ).toThrow("stock");
  });
  it("resolves selected brands and every removable component without parsing labels", () => {
    expect(
      resolveRecipe({
        id: "pack-classica",
        quantity: 1,
        options: {
          beer: "sagres",
          vodka: "smirnoff",
          mixer: "seven-up",
          mixer2: "seven-up",
          ice: "none",
          water: "none",
          cups: "none",
          snack: "none",
          snack2: "none",
        },
      }),
    ).toEqual([
      { sku: "sagres-mini-20", quantity: 24 },
      { sku: "seven-up", quantity: 2 },
      { sku: "smirnoff", quantity: 1 },
    ]);
    expect(
      resolveRecipe({
        id: "pack-sem-ressacas",
        quantity: 1,
        options: {
          mixer: "none",
          ice: "none",
          water: "none",
          cups: "none",
          snack: "none",
          snack2: "none",
        },
      }),
    ).toEqual([
      { sku: "red-bull-25", quantity: 4 },
      { sku: "super-bock-zero-33", quantity: 12 },
    ]);
  });
  it("requires store-specific price, stock and explicit compliance metadata", () => {
    const item = [{ id: "gelo", quantity: 1 }];
    expect(() => priceStoreBasket(item, [], 100)).toThrow();
    expect(priceStoreBasket(item, [stock("gelo", 250)], 100).total).toBe(550);
    expect(priceStoreBasket(item, [stock("gelo", 300)], 100).total).toBe(600);
  });
});
describe("routing and transition guards", () => {
  const now = new Date("2026-10-12T00:30:00+01:00");
  const s: Store = {
    id: "store",
    name: "Test",
    pickup_address: {
      street_address: ["Rua de teste 1"],
      city: "Lisboa",
      zip_code: "1000-001",
      country: "PT",
    },
    phone: "+351911234567",
    email: "test@example.com",
    commission_bps: 1000,
    service_fee: 200,
    preparation_minutes: 10,
    easypay_account_id: null,
    clearing_period: null,
    release_delay_days: null,
    enabled: true,
    paused: false,
    timezone: "Europe/Lisbon",
    opening_hours: { "0": [{ start: "22:00", end: "02:00" }] },
    heartbeat_at: now.toISOString(),
    delivery_postcodes: ["1000-001"],
  };
  it("handles overnight Lisbon hours and stale merchant heartbeats", () => {
    const address = {
      street_address: ["Rua de teste 1"],
      city: "Lisboa",
      zip_code: "1000-001",
      country: "PT" as const,
    };
    expect(storeOpen(s, now)).toBe(true);
    expect(eligibleStore(s, address, now)).toBe(true);
    expect(
      eligibleStore(
        { ...s, heartbeat_at: new Date(now.getTime() - 91000).toISOString() },
        address,
        now,
      ),
    ).toBe(false);
    expect(eligibleStore(s, { ...address, zip_code: "4000-001" }, now)).toBe(
      false,
    );
    expect(storeOpen(s, new Date("2026-10-12T02:30:00+01:00"))).toBe(false);
  });
  it("blocks preparation without capture and booking, late acceptance and premature completion", () => {
    expect(
      canTransition("confirming", "preparing", {
        payment: "authorised",
        delivery: "pending",
      }),
    ).toBe(false);
    expect(
      canTransition("confirming", "preparing", {
        payment: "paid",
        delivery: "unknown",
      }),
    ).toBe(false);
    expect(
      canTransition("confirming", "preparing", {
        payment: "paid",
        delivery: "pending",
      }),
    ).toBe(true);
    expect(
      canTransition("awaiting_merchant", "confirming", {
        payment: "authorised",
        acceptance_deadline: "2020-01-01T00:00:00Z",
      }),
    ).toBe(false);
    expect(
      canTransition("delivered", "completed", {
        payment: "paid",
        settlement: "released",
      }),
    ).toBe(false);
    expect(
      canTransition("delivered", "completed", {
        payment: "paid",
        settlement: "settled",
      }),
    ).toBe(true);
    expect(
      canTransition("completed", "awaiting_payment", { payment: "paid" }),
    ).toBe(false);
  });
});
