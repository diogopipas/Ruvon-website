import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { priceBasket } from "@/lib/pricing";
import { eventNames } from "@/lib/validation";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role;",
  );
  const migrations = (await readdir("supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(`supabase/migrations/${migration}`, "utf8");
    // PGlite includes gen_random_uuid in core; its WASM build omits pgcrypto.
    await db.exec(sql.replace("create extension if not exists pgcrypto;", ""));
  }
}, 20000);
afterAll(async () => {
  await db.close();
});
function fixture() {
  const session_id = randomUUID();
  const now = new Date().toISOString();
  const priced = priceBasket([
    { id: "super-bock", quantity: 1 },
    { id: "gelo", quantity: 1 },
    { id: "coca-cola", quantity: 1 },
    { id: "doritos", quantity: 1 },
  ]);
  const order = {
    id: session_id,
    session_id,
    created_at: now,
    updated_at: now,
    city: "Lisboa",
    postcode: "1000-001",
    items: priced.items,
    subtotal: priced.subtotal,
    delivery_fee: priced.delivery_fee,
    service_fee: priced.service_fee,
    total: priced.total,
    converted_to_lead: false,
    reached_checkout: true,
    utm_source: "instagram",
    utm_campaign: "sql_test",
  };
  const lead = {
    id: randomUUID(),
    session_id,
    created_at: now,
    city: "Lisboa",
    postcode: "1000-001",
    email: "sql@example.com",
    phone: null,
    consent_at: now,
    basket_total: priced.total,
    basket_items: priced.items,
    utm_source: "instagram",
    utm_campaign: "sql_test",
  };
  return { order, lead };
}
describe("PostgreSQL migration and transactions", () => {
  it("accepts every event emitted by the client after the pack analytics migration", async () => {
    const sessionId = randomUUID();
    for (const name of eventNames) {
      await db.query(
        "insert into public.analytics_events (id, session_id, name) values ($1, $2, $3)",
        [randomUUID(), sessionId, name],
      );
    }
    const result = await db.query(
      "select name from public.analytics_events where session_id = $1",
      [sessionId],
    );
    expect(result.rows).toHaveLength(eventNames.length);
    await expect(
      db.query(
        "insert into public.analytics_events (id, session_id, name) values ($1, $2, $3)",
        [randomUUID(), sessionId, "not_an_event"],
      ),
    ).rejects.toThrow();
  });

  it("atomically stores lead and order and makes retries idempotent", async () => {
    const { order, lead } = fixture();
    for (let n = 0; n < 2; n++)
      await db.query("select public.capture_lead($1::jsonb,$2::jsonb)", [
        JSON.stringify(lead),
        JSON.stringify(order),
      ]);
    const orders = await db.query(
      "select * from public.simulated_orders where session_id=$1",
      [order.session_id],
    );
    expect(orders.rows).toHaveLength(1);
    expect(orders.rows[0]).toMatchObject({
      total: 1704,
      converted_to_lead: true,
      utm_campaign: "sql_test",
    });
    expect(
      (
        await db.query("select * from public.leads where session_id=$1", [
          order.session_id,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("accepts city-only leads after the migration", async () => {
    const { order, lead } = fixture();
    await db.query("select public.capture_lead($1::jsonb,$2::jsonb)", [
      JSON.stringify({ ...lead, postcode: "" }),
      JSON.stringify({ ...order, postcode: "" }),
    ]);
    const result = await db.query(
      "select city, postcode from public.leads where session_id=$1",
      [lead.session_id],
    );
    expect(result.rows).toEqual([{ city: "Lisboa", postcode: "" }]);
  });
  it("rolls the order back when the lead fails a constraint", async () => {
    const { order, lead } = fixture();
    await expect(
      db.query("select public.capture_lead($1::jsonb,$2::jsonb)", [
        JSON.stringify({ ...lead, email: null, phone: null }),
        JSON.stringify(order),
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "select * from public.simulated_orders where session_id=$1",
          [order.session_id],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("retains conversion, checkout, location and attribution after a late cart save", async () => {
    const { order, lead } = fixture();
    await db.query("select public.capture_lead($1::jsonb,$2::jsonb)", [
      JSON.stringify(lead),
      JSON.stringify(order),
    ]);
    await db.query("select public.save_simulated_order($1::jsonb)", [
      JSON.stringify({
        ...order,
        city: "",
        postcode: "",
        reached_checkout: false,
        utm_campaign: null,
      }),
    ]);
    expect(
      (
        await db.query(
          "select * from public.simulated_orders where session_id=$1",
          [order.session_id],
        )
      ).rows[0],
    ).toMatchObject({
      converted_to_lead: true,
      reached_checkout: true,
      city: "Lisboa",
      postcode: "1000-001",
      utm_campaign: "sql_test",
    });
  });
  it("denies anonymous table access and RPC execution", async () => {
    const { order } = fixture();
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.leads")).rejects.toThrow();
      await expect(
        db.query("select public.save_simulated_order($1::jsonb)", [
          JSON.stringify(order),
        ]),
      ).rejects.toThrow();
      await expect(
        db.query("select public.capture_lead($1::jsonb, null)", ["{}"]),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("preserves purchase intent and attribution after a city-only retry", async () => {
    const { order, lead } = fixture();
    await db.query("select public.capture_lead($1::jsonb,$2::jsonb)", [
      JSON.stringify(lead),
      JSON.stringify(order),
    ]);
    const citySignup = {
      ...lead,
      id: randomUUID(),
      city: "Porto",
      postcode: "4000-001",
      basket_items: [],
      basket_total: 0,
      utm_source: null,
      utm_campaign: null,
    };
    await db.query("select public.capture_lead($1::jsonb, null)", [
      JSON.stringify(citySignup),
    ]);
    const saved = await db.query(
      "select * from public.leads where session_id=$1",
      [lead.session_id],
    );
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0]).toMatchObject({
      id: lead.id,
      city: "Porto",
      basket_items: lead.basket_items,
      basket_total: 1704,
      utm_source: "instagram",
      utm_campaign: "sql_test",
    });
  });
  it("updates the saved basket when the visitor submits a different nonempty basket", async () => {
    const { order, lead } = fixture();
    await db.query("select public.capture_lead($1::jsonb,$2::jsonb)", [
      JSON.stringify(lead),
      JSON.stringify(order),
    ]);
    const priced = priceBasket([{ id: "gelo", quantity: 2 }]);
    await db.query("select public.capture_lead($1::jsonb,$2::jsonb)", [
      JSON.stringify({
        ...lead,
        basket_items: priced.items,
        basket_total: priced.total,
      }),
      JSON.stringify({ ...order, ...priced }),
    ]);
    const saved = await db.query(
      "select basket_items, basket_total from public.leads where session_id=$1",
      [lead.session_id],
    );
    expect(saved.rows[0]).toEqual({
      basket_items: priced.items,
      basket_total: priced.total,
    });
  });
});
