import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { OrderView } from "@/lib/commerce";

// UI journeys use explicit browser transport fixtures. They are not real-provider acceptance.
function order(): OrderView {
  return {
    id: randomUUID(),
    operational_status: "awaiting_payment",
    version: 0,
    payment_status: "not_started",
    merchant_status: "not_requested",
    settlement_status: "held",
    items: [
      {
        id: "gelo",
        name: "Saco de gelo 2 kg",
        quantity: 1,
        unit_price: 100,
        line_price: 100,
        recipe: [{ sku: "gelo", quantity: 1 }],
        components: [{ sku: "gelo", quantity: 1, unit_price: 100 }],
      },
    ],
    subtotal: 100,
    delivery_fee: 400,
    service_fee: 200,
    total: 700,
    currency: "EUR",
    acceptance_deadline: null,
    created_at: new Date().toISOString(),
    quote_expires_at: new Date(Date.now() + 600000).toISOString(),
    eta: new Date(Date.now() + 1800000).toISOString(),
    tracking_url: null,
    refunded: 0,
    allowed_actions: ["cancel"],
  };
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("jola_age", "true");
    localStorage.setItem(
      "jola_cart",
      JSON.stringify([{ id: "gelo", quantity: 9 }]),
    );
  });
});
test("checkout resumes one pending order after refresh and clears only purchased quantities once", async ({
  page,
}) => {
  const saved = order();
  const validationRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (["/api/orders", "/api/events"].includes(path))
      validationRequests.push(path);
  });
  let quoteCalls = 0,
    starts = 0;
  await page.route("**/api/commerce/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/commerce/catalog")
      return route.fulfill({
        json: [
          {
            id: randomUUID(),
            catalog: [
              { id: "gelo", name: "Saco de gelo 2 kg", unit_price: 100 },
            ],
          },
        ],
      });
    if (path === "/api/commerce/quotes") {
      quoteCalls++;
      const input = route.request().postDataJSON();
      expect(input.items).toEqual([{ id: "gelo", quantity: 1 }]);
      expect(input.address.zip_code).toBe("1000-001");
      expect(input.total).toBeUndefined();
      return route.fulfill({ json: saved, status: 201 });
    }
    if (path === "/api/commerce/orders") {
      starts++;
      expect(route.request().postDataJSON()).toMatchObject({
        quote_id: saved.id,
        method: "MBW",
        age_confirmed: true,
        terms_confirmed: true,
      });
      saved.payment_status = "unknown";
      saved.version = 1;
      return route.fulfill({ status: 202, json: { id: saved.id } });
    }
    if (path.endsWith("/payment"))
      return route.fulfill({ json: { manifest: null, testing: true } });
    if (path === `/api/commerce/orders/${saved.id}`)
      return route.fulfill({ json: saved });
    return route.fulfill({
      status: 503,
      json: { error: "Unexpected fixture request" },
    });
  });
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByLabel("Morada", { exact: true }).fill("Rua de Teste 1");
  await page.getByLabel("Código postal").fill("1000-001");
  await page.getByLabel("Cidade", { exact: true }).fill("Lisboa");
  await page
    .getByRole("button", { name: "Confirmar preços e entrega" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Revê o teu pedido" }),
  ).toBeVisible();
  await page.getByLabel("Nome de quem recebe").fill("Cliente Sintético");
  await page.getByLabel("Número MB WAY").fill("911234567");
  await page.locator('input[name="terms"]').check();
  await page.getByRole("button", { name: /Autorizar/ }).click();
  await expect(page).toHaveURL(`/pedido/${saved.id}`);
  await page.reload();
  await expect(
    page.getByText("Estamos a verificar a autorização", { exact: false }),
  ).toBeVisible();
  await page.goto("/checkout");
  await expect(page).toHaveURL(`/pedido/${saved.id}`);
  expect(starts).toBe(1);
  expect(quoteCalls).toBe(1);
  expect(validationRequests).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.getItem("jola_session")),
  ).toBeNull();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("jola_cart")!)),
  ).toEqual([{ id: "gelo", quantity: 9 }]);
  await page.evaluate(() =>
    localStorage.setItem(
      "ruvon_sandbox_commerce_cart",
      JSON.stringify({
        items: [
          { id: "gelo", quantity: 4 },
          { id: "coca-cola", quantity: 1 },
        ],
        confirmedOrders: [],
      }),
    ),
  );
  saved.operational_status = "preparing";
  saved.payment_status = "paid";
  saved.allowed_actions = ["request_review", "report_issue"];
  await page.reload();
  await expect(
    page.getByText("A preparar a tua noite", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("ruvon_sandbox_commerce_cart")!)
            .items,
      ),
    )
    .toEqual([
      { id: "gelo", quantity: 3 },
      { id: "coca-cola", quantity: 1 },
    ]);
  await page.reload();
  await expect(
    page.getByText("A preparar a tua noite", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ruvon_sandbox_commerce_cart")!).items,
    ),
  ).toEqual([
    { id: "gelo", quantity: 3 },
    { id: "coca-cola", quantity: 1 },
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("merchant acceptance confirms stock and preparation waits for captured payment and booking", async ({
  page,
}) => {
  const saved = order(),
    store = randomUUID();
  saved.operational_status = "awaiting_merchant";
  saved.payment_status = "authorised";
  saved.version = 2;
  let preparationAllowed = false,
    accepted = 0,
    readied = 0;
  await page.route("**/api/merchant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/commands")) {
      const command = route.request().postDataJSON();
      expect(command.expected_version).toBe(saved.version);
      expect(command.command_id).toMatch(/^[0-9a-f-]{36}$/);
      if (command.command === "accept") {
        accepted++;
        saved.operational_status = "confirming";
        saved.version++;
      }
      if (command.command === "ready") {
        readied++;
        expect(command.seal).toBe("seal-test");
        saved.operational_status = "ready_for_pickup";
        saved.version++;
      }
      return route.fulfill({ json: { id: saved.id } });
    }
    if (path === "/api/merchant/orders")
      return route.fulfill({
        json: {
          orders: [
            {
              ...saved,
              store_id: store,
              acceptance_deadline: new Date(Date.now() + 180000).toISOString(),
              preparation_allowed: preparationAllowed,
            },
          ],
          stores: [{ id: store, name: "Loja Sintética", paused: false }],
        },
      });
    if (path === "/api/merchant/inventory") return route.fulfill({ json: [] });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/merchant");
  await page
    .getByRole("button", { name: "Aceitar pedido", exact: true })
    .click();
  expect(accepted).toBe(1);
  await expect(
    page.getByRole("button", { name: "Selado e pronto para recolha" }),
  ).toHaveCount(0);
  saved.operational_status = "preparing";
  saved.payment_status = "paid";
  saved.version++;
  preparationAllowed = true;
  await page.reload();
  await expect(page.getByText("Podes preparar", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept("seal-test"));
  await page
    .getByRole("button", { name: "Selado e pronto para recolha" })
    .click();
  await expect.poll(() => readied).toBe(1);
});
