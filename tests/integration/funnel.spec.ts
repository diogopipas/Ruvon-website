import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Database } from "@/types";
const headers = { origin: "http://localhost:3100" };
async function database(): Promise<Database> {
  return JSON.parse(await readFile(".data/integration/jola.json", "utf8"));
}
test("pack substitutions survive order, lead, analytics and retry with canonical prices", async ({
  request,
}) => {
  const session_id = randomUUID();
  const items = [
    {
      id: "pack-classica",
      quantity: 1,
      options: { beer: "sagres", mixer: "coca-cola-zero" },
      price: 1,
    },
    { id: "gelo", quantity: 1 },
  ];
  const data = {
    session_id,
    items,
    reached_checkout: true,
    location: { city: "Lisboa", postcode: "1000001" },
    attribution: { utm_campaign: "packs-validation" },
  };
  expect((await request.post("/api/orders", { headers, data })).status()).toBe(
    200,
  );
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request.post("/api/leads", {
          headers,
          data: {
            ...data,
            contact: `pack-${session_id}@example.com`,
            consent: true,
          },
        })
      ).status(),
    ).toBe(200);
  const db = await database();
  const lead = db.leads.find((row) => row.session_id === session_id)!;
  const order = db.simulated_orders.find(
    (row) => row.session_id === session_id,
  )!;
  expect(order).toMatchObject({
    subtotal: 5289,
    total: 5677,
    converted_to_lead: true,
  });
  expect(lead.basket_total).toBe(5677);
  expect(lead.basket_items).toEqual(order.items);
  expect(lead.basket_items[0]).toMatchObject({
    product_type: "pack",
    price: 4990,
    options: { beer: "sagres", mixer: "coca-cola-zero" },
  });
  expect(lead.basket_items[0].contents).toContain("24 × Sagres 33 cl");
  expect(db.leads.filter((row) => row.session_id === session_id)).toHaveLength(
    1,
  );
  const properties = {
    product: "pack-classica",
    product_type: "pack",
    pack_id: "pack-classica",
    pack_name: "A Clássica",
    pack_price: 49.9,
    people_min: 5,
    people_max: 7,
    selected_options: items[0].options,
  };
  expect(
    (
      await request.post("/api/events", {
        headers,
        data: {
          id: randomUUID(),
          session_id,
          name: "product_added",
          properties,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await database()).analytics_events.find(
      (row) => row.session_id === session_id,
    )?.properties,
  ).toEqual(properties);
});
test("complete demand funnel persists canonical basket, location, attribution and lead, with retry-safe conversion", async ({
  request,
}) => {
  const session_id = randomUUID();
  const items = [
    { id: "super-bock", quantity: 1 },
    { id: "gelo", quantity: 1 },
    { id: "coca-cola", quantity: 1 },
    { id: "doritos", quantity: 1 },
  ];
  const attribution = {
    utm_source: "instagram",
    utm_medium: "paid_social",
    utm_campaign: `acceptance-${session_id}`,
    utm_content: "video-2347",
  };
  for (const name of [
    "landing_view",
    "order_cta_clicked",
    "product_added",
    "cart_opened",
    "checkout_started",
  ]) {
    const event = await request.post("/api/events", {
      headers,
      data: {
        id: randomUUID(),
        session_id,
        name,
        properties: {
          ...attribution,
          product: "super-bock",
          category: "cerveja",
          basket_value: 14.46,
          item_count: 4,
        },
      },
    });
    expect(event.status()).toBe(200);
  }
  const order = await request.post("/api/orders", {
    headers,
    data: { session_id, items, attribution, total: 1 },
  });
  expect(order.status()).toBe(200);
  let db = await database();
  let saved = db.simulated_orders.find((o) => o.session_id === session_id)!;
  expect(saved.subtotal).toBe(1446);
  expect(saved.total).toBe(1834);
  expect(saved.converted_to_lead).toBe(false);
  const location = { city: "Lisboa", postcode: "1000-001" };
  expect(
    (
      await request.post("/api/orders", {
        headers,
        data: {
          session_id,
          items,
          attribution,
          location,
          reached_checkout: true,
        },
      })
    ).status(),
  ).toBe(200);
  const data = {
    session_id,
    items,
    attribution,
    location,
    contact: `qa-${session_id}@example.com`,
    consent: true,
  };
  for (let i = 0; i < 2; i++)
    expect((await request.post("/api/leads", { headers, data })).status()).toBe(
      200,
    );
  // An in-flight cart write after conversion must never revert that conversion.
  expect(
    (
      await request.post("/api/orders", {
        headers,
        data: { session_id, items, attribution },
      })
    ).status(),
  ).toBe(200);
  db = await database();
  saved = db.simulated_orders.find((o) => o.session_id === session_id)!;
  expect(saved).toMatchObject({
    total: 1834,
    converted_to_lead: true,
    reached_checkout: true,
    city: "Lisboa",
    postcode: "1000-001",
    utm_content: "video-2347",
  });
  expect(db.leads.filter((l) => l.session_id === session_id)).toHaveLength(1);
  expect(db.leads.find((l) => l.session_id === session_id)).toMatchObject({
    basket_total: 1834,
    utm_source: "instagram",
    utm_campaign: attribution.utm_campaign,
    city: "Lisboa",
    postcode: "1000-001",
  });
  const anonymous = await request.get("/admin");
  expect(await anonymous.text()).not.toContain(data.contact);
  expect(
    (
      await request.post("/api/admin/login", {
        headers,
        data: { password: "wrong" },
      })
    ).status(),
  ).toBe(401);
  const login = await request.post("/api/admin/login", {
    headers,
    data: { password: "jola-integration-only" },
  });
  expect(login.status()).toBe(200);
  expect(login.headers()["set-cookie"]).toContain("HttpOnly");
  expect(login.headers()["set-cookie"]).toContain("SameSite=strict");
  const admin = await request.get("/admin");
  expect(await admin.text()).toContain(data.contact);
  expect(await admin.text()).toContain(attribution.utm_campaign);
  expect(
    (await request.post("/api/admin/logout", { headers, data: {} })).status(),
  ).toBe(200);
  expect(await (await request.get("/admin")).text()).not.toContain(
    data.contact,
  );
});
test("rejects invalid, forged, oversized and cross-origin submissions", async ({
  request,
}) => {
  const input = {
    session_id: randomUUID(),
    items: [{ id: "gelo", quantity: 1 }],
    location: { city: "Porto", postcode: "4000-001" },
    contact: "invalid",
    consent: true,
  };
  expect(
    (await request.post("/api/leads", { headers, data: input })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/leads", {
        headers,
        data: { ...input, contact: "test@example.com", consent: false },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/orders", {
        headers,
        data: {
          session_id: input.session_id,
          items: [{ id: "fake", quantity: 1 }],
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/orders", {
        headers: { origin: "https://other.example" },
        data: input,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/events", {
        headers,
        data: { long: "a".repeat(17000) },
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await request.post("/api/events", {
        headers: { ...headers, "content-type": "application/json" },
        data: "{broken",
      })
    ).status(),
  ).toBe(400);
});
test("city-only waitlist and merchant interests remain separate from orders", async ({
  request,
}) => {
  const session_id = randomUUID();
  const result = await request.post("/api/leads", {
    headers,
    data: {
      session_id,
      items: [],
      location: { city: "Braga", postcode: "4700-001" },
      contact: "+351 912 345 678",
      consent: true,
    },
  });
  expect(result.status()).toBe(200);
  const store_name = `Loja QA ${randomUUID()}`;
  const submission_id = randomUUID();
  for (let retry = 0; retry < 2; retry++) {
    const response = await request.post("/api/merchants", {
      headers,
      data: {
        submission_id,
        store_name,
        city: "Porto",
        contact_name: "Pessoa de teste",
        contact: "loja@example.com",
        consent: true,
      },
    });
    expect(response.status()).toBe(200);
  }
  const db = await database();
  expect(db.simulated_orders.some((o) => o.session_id === session_id)).toBe(
    false,
  );
  expect(db.leads.find((l) => l.session_id === session_id)).toMatchObject({
    city: "Braga",
    basket_total: 0,
    phone: "+351912345678",
  });
  expect(
    db.merchant_interests.filter((m) => m.id === submission_id),
  ).toHaveLength(1);
});
test("all public routes and the OpenGraph asset render in production", async ({
  request,
}) => {
  for (const route of [
    "/",
    "/pedir",
    "/checkout",
    "/privacidade",
    "/termos",
    "/robots.txt",
    "/sitemap.xml",
  ])
    expect((await request.get(route)).status()).toBe(200);
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
  expect((await request.get("/does-not-exist")).status()).toBe(404);
});
