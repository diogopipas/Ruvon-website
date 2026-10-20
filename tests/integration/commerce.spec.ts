import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("disabled commerce fails closed without changing validation or exposing private records", async ({
  request,
}) => {
  const id = randomUUID(),
    origin = { origin: "http://localhost:3100" };
  for (const path of [
    "/api/commerce/catalog",
    `/api/commerce/orders/${id}`,
    `/api/commerce/orders/${id}/payment`,
    "/api/merchant/orders",
    "/api/admin/orders",
    "/api/admin/operations",
    `/api/admin/orders/${id}`,
  ]) {
    const response = await request.get(path);
    expect([401, 403, 404, 503]).toContain(response.status());
    expect(await response.text()).not.toContain("owner_hash");
  }
  for (const path of [
    "/api/commerce/quotes",
    "/api/commerce/orders",
    `/api/commerce/orders/${id}/cancel`,
    `/api/commerce/orders/${id}/issues`,
    "/api/admin/operations/commands",
  ])
    expect([401, 403, 404, 503]).toContain(
      (await request.post(path, { headers: origin, data: {} })).status(),
    );
  expect(
    (await request.post("/api/internal/jobs/run", { data: {} })).status(),
  ).toBe(401);
  const callback = await request.post("/api/webhooks/twilio", {
    form: { MessageStatus: "delivered", Body: "untrusted" },
  });
  expect(callback.status()).toBe(401);
  expect(await callback.text()).not.toContain("untrusted");
  const health = await request.get("/api/health");
  expect(health.status()).toBe(503);
  expect(await health.json()).toEqual({ ok: false });
  expect((await request.get("/checkout")).status()).toBe(200);
});
