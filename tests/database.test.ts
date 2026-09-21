import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { priceBasket } from "@/lib/pricing";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role;",
  );
  const sql = await readFile("supabase/migrations/001_jola.sql", "utf8");
  // PGlite includes gen_random_uuid in core; its WASM build omits the optional pgcrypto extension.
  await db.exec(sql.replace("create extension if not exists pgcrypto;", ""));
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
      total: 1834,
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
    } finally {
      await db.exec("reset role");
    }
  });
});
