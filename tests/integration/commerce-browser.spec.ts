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
test("store craft units survive reload and quote recovery without entering the validation cart", async ({
  page,
}) => {
  const sku = "brewery-fixture-ipa-330",
    id = `sku:${sku}`;
  const saved = order();
  saved.items = [
    {
      id,
      name: "IPA de teste",
      quantity: 2,
      unit_price: 537,
      line_price: 1074,
      recipe: [{ sku, quantity: 1 }],
      components: [{ sku, quantity: 1, unit_price: 537 }],
    },
  ];
  saved.subtotal = 1074;
  saved.total = 1674;
  let quotes = 0;
  await page.route("**/api/commerce/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/commerce/catalog")
      return route.fulfill({
        json: [
          {
            id: randomUUID(),
            name: "Cervejaria sintética",
            catalog: [
              {
                id,
                name: "IPA de teste",
                unit: "garrafa de 33 cl",
                unit_price: 537,
              },
            ],
          },
        ],
      });
    if (path === "/api/commerce/quotes") {
      quotes++;
      expect(route.request().postDataJSON().items).toEqual([
        { id, quantity: 2 },
      ]);
      return route.fulfill({ json: saved, status: 201 });
    }
    if (path === `/api/commerce/orders/${saved.id}`)
      return route.fulfill({ json: saved });
    return route.fulfill({
      status: 503,
      json: { error: "Unexpected fixture request" },
    });
  });
  await page.goto("/checkout");
  await expect(
    page.getByText("garrafa de 33 cl", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pack Clássica" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Retirar · 2" })).toBeVisible();
  await page.getByLabel("Morada", { exact: true }).fill("Rua Sintética 1");
  await page.getByLabel("Código postal").fill("1000-001");
  await page.getByLabel("Cidade", { exact: true }).fill("Lisboa");
  await page
    .getByRole("button", { name: "Confirmar preços e entrega" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Revê o teu pedido" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Revê o teu pedido" }),
  ).toBeVisible();
  await expect(
    page.getByText("2 × IPA de teste", { exact: false }),
  ).toBeVisible();
  expect(quotes).toBe(1);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("jola_cart")!)),
  ).toEqual([{ id: "gelo", quantity: 9 }]);
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
  await page.reload();
  await expect(
    page.getByText("A aguardar confirmação", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Selado e pronto para recolha" }),
  ).toHaveCount(0);
  preparationAllowed = true;
  await page.reload();
  await expect(page.getByText("Podes preparar", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept("seal-test"));
  await page
    .getByRole("button", { name: "Selado e pronto para recolha" })
    .click();
  await expect.poll(() => readied).toBe(1);
});

function merchantSnapshot() {
  const saved = order();
  const store = randomUUID();
  return {
    orders: [{ ...saved, store_id: store, preparation_allowed: false }],
    stores: [{ id: store, name: "Loja privada de teste", paused: false }],
    inventory: [
      {
        store_id: store,
        sku: "gelo",
        name: "Stock privado de teste",
        unit: "saco",
        stock_on_hand: 5,
        reserved_quantity: 1,
        enabled: true,
        version: 0,
      },
    ],
  };
}

for (const status of [401, 403])
  test(`merchant removes orders and stock and stops heartbeats after polling returns ${status}`, async ({
    page,
  }) => {
    const data = merchantSnapshot();
    let authorized = true;
    let reads = 0;
    let heartbeats = 0;
    await page.clock.install();
    await page.route("**/api/merchant/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/merchant/orders") {
        reads++;
        return authorized
          ? route.fulfill({ json: data })
          : route.fulfill({ status, json: { error: "Não autorizado" } });
      }
      if (path === "/api/merchant/inventory")
        return route.fulfill({ json: data.inventory });
      if (path === "/api/merchant/heartbeat") {
        heartbeats++;
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ status: 503 });
    });
    await page.goto("/merchant");
    await expect(
      page.getByRole("heading", { name: "Stock privado de teste · saco" }),
    ).toBeVisible();
    await expect(
      page.getByText(data.stores[0].name, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: `Pedido ${data.orders[0].id.slice(0, 8)}`,
      }),
    ).toBeVisible();
    await expect.poll(() => heartbeats).toBeGreaterThan(0);
    authorized = false;
    await page.clock.fastForward(5000);
    await expect(
      page.getByRole("main").getByRole("alert").first(),
    ).toContainText("Inicia sessão novamente");
    await expect(
      page.getByText(data.stores[0].name, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Inventário da loja" }),
    ).toHaveCount(0);
    await expect(page.locator("article.commerce-card")).toHaveCount(0);
    const stoppedReads = reads;
    const stoppedHeartbeats = heartbeats;
    await page.clock.fastForward(30000);
    expect(reads).toBe(stoppedReads);
    expect(heartbeats).toBe(stoppedHeartbeats);
  });

test("inventory access denial clears the dashboard and a late successful poll cannot restore it", async ({
  page,
}) => {
  const data = merchantSnapshot();
  let reads = 0;
  let inventoryDenied = false;
  let held = false;
  let holdReads = false;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.clock.install();
  await page.route("**/api/merchant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/merchant/orders") {
      reads++;
      if (holdReads) {
        held = true;
        await pending;
      }
      return route.fulfill({ json: data });
    }
    if (path === "/api/merchant/inventory") {
      if (route.request().method() === "POST") {
        inventoryDenied = true;
        return route.fulfill({ json: { ok: true } });
      }
      return inventoryDenied
        ? route.fulfill({ status: 403, json: { error: "Não autorizado" } })
        : route.fulfill({ json: data.inventory });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/merchant");
  await expect(
    page.getByRole("heading", { name: "Stock privado de teste · saco" }),
  ).toBeVisible();
  holdReads = true;
  await page.clock.fastForward(5000);
  await expect.poll(() => held).toBe(true);
  const heldReads = reads;
  await page.getByRole("button", { name: "Guardar disponibilidade" }).click();
  await expect(page.getByRole("main").getByRole("alert").first()).toContainText(
    "Inicia sessão novamente",
  );
  const response = page.waitForResponse("**/api/merchant/orders");
  release();
  await response;
  await expect(
    page.getByText(data.stores[0].name, { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("article.commerce-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Inventário da loja" }),
  ).toHaveCount(0);
  await page.clock.fastForward(30000);
  expect(reads).toBe(heldReads);
});

test("a transient merchant read failure preserves the session and a later poll recovers", async ({
  page,
}) => {
  const data = merchantSnapshot();
  let failing = false;
  await page.clock.install();
  await page.route("**/api/merchant/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/merchant/orders")
      return failing
        ? route.fulfill({ status: 503, json: { error: "Indisponível" } })
        : route.fulfill({ json: data });
    if (path === "/api/merchant/inventory")
      return route.fulfill({ json: data.inventory });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/merchant");
  await expect(
    page.getByRole("heading", { name: "Stock privado de teste · saco" }),
  ).toBeVisible();
  failing = true;
  await page.clock.fastForward(5000);
  await expect(page.getByRole("main").getByRole("alert").first()).toContainText(
    "Não foi possível atualizar",
  );
  await expect(page.locator("article.commerce-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Stock privado de teste · saco" }),
  ).toBeVisible();
  failing = false;
  await page.clock.fastForward(5000);
  await expect(page.getByRole("main").getByRole("alert").first()).toBeEmpty();
});

for (const endpoint of ["inventory", "heartbeat"])
  test(`merchant clears private data when the ${endpoint} write loses access`, async ({
    page,
  }) => {
    const data = merchantSnapshot();
    let deny = false;
    await page.clock.install();
    await page.route("**/api/merchant/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/merchant/orders") return route.fulfill({ json: data });
      if (
        deny &&
        path === `/api/merchant/${endpoint}` &&
        route.request().method() === "POST"
      )
        return route.fulfill({
          status: 403,
          json: { error: "Não autorizado" },
        });
      if (path === "/api/merchant/inventory")
        return route.fulfill({ json: data.inventory });
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto("/merchant");
    await expect(
      page.getByRole("heading", { name: "Stock privado de teste · saco" }),
    ).toBeVisible();
    deny = true;
    if (endpoint === "inventory")
      await page
        .getByRole("button", { name: "Guardar disponibilidade" })
        .click();
    else await page.clock.fastForward(30000);
    await expect(
      page.getByRole("main").getByRole("alert").first(),
    ).toContainText("Inicia sessão novamente");
    await expect(page.locator("article.commerce-card")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Inventário da loja" }),
    ).toHaveCount(0);
    await expect(
      page.getByText(data.stores[0].name, { exact: true }),
    ).toHaveCount(0);
  });
