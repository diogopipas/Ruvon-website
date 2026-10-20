import { expect, test, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { MerchantCommand, OrderState } from "@/lib/commerce";

// Synthetic browser transports only. Database replay/restock guards are tested separately.
function board() {
  const store = randomUUID();
  return {
    stores: [{ id: store, name: "Loja de comandos sintéticos", paused: false }],
    orders: [
      {
        id: randomUUID(),
        store_id: store,
        version: 2,
        operational_status: "awaiting_merchant" as OrderState,
        acceptance_deadline: new Date(Date.now() + 180000).toISOString(),
        preparation_allowed: false,
        return_received_allowed: false,
        items: [
          {
            id: "gelo",
            name: "Gelo de teste",
            quantity: 2,
            unit_price: 100,
            line_price: 200,
            recipe: [{ sku: "gelo", quantity: 1 }],
            components: [{ sku: "gelo", quantity: 1, unit_price: 100 }],
          },
        ],
      },
    ],
  };
}

async function transport(
  page: Page,
  read: (route: Route) => Promise<void>,
  write: (route: Route) => Promise<void>,
) {
  await page.clock.install();
  await page.route("**/api/merchant/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/commands")) return write(route);
    if (path === "/api/merchant/orders") return read(route);
    if (path === "/api/merchant/inventory") return route.fulfill({ json: [] });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/merchant");
  await expect(
    page.getByText("Loja de comandos sintéticos", { exact: true }),
  ).toBeVisible();
}

for (const [command, button, next, seal] of [
  ["accept", "Aceitar pedido", "confirming", null],
  [
    "ready",
    "Selado e pronto para recolha",
    "ready_for_pickup",
    "selo-sintético",
  ],
  ["unavailable", "Artigo indisponível", "cancelling", "gelo"],
] as const)
  test(`merchant replays the same ${command} after a lost response even when polling advances the order`, async ({
    page,
  }) => {
    const data = board();
    if (command === "ready") {
      data.orders[0].operational_status = "preparing";
      data.orders[0].preparation_allowed = true;
    }
    const calls: MerchantCommand[] = [];
    let prompts = 0;
    page.on("dialog", (dialog) => {
      prompts++;
      return dialog.accept(seal ?? "");
    });
    await transport(
      page,
      (route) => route.fulfill({ json: data }),
      async (route) => {
        calls.push(route.request().postDataJSON());
        data.orders[0].operational_status = next;
        data.orders[0].version = 3;
        if (calls.length === 1) return route.abort("failed");
        return route.fulfill({ json: { id: data.orders[0].id, version: 3 } });
      },
    );
    const action = page.getByRole("button", { name: button, exact: true });
    if (command === "accept")
      await action.evaluate((element: HTMLButtonElement) => {
        element.click();
        element.click();
      });
    else await action.click();
    const recovery = page.getByRole("region", {
      name: `Ação do pedido ${data.orders[0].id.slice(0, 8)}`,
    });
    await expect(
      recovery.getByRole("button", { name: "Repetir a mesma ação" }),
    ).toBeEnabled();
    expect(calls).toHaveLength(1);
    await page.clock.fastForward(5000);
    await expect(page.locator("article.commerce-card")).toContainText(next);
    await recovery
      .getByRole("button", { name: "Repetir a mesma ação" })
      .click();
    await expect(recovery).toHaveCount(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0]).toMatchObject({
      expected_version: 2,
      command,
      ...(seal ? { seal } : {}),
    });
    expect(prompts).toBe(seal ? 1 : 0);
  });

test("a confirmed merchant command retries only the failed status read", async ({
  page,
}) => {
  const data = board();
  let failReads = false;
  let posts = 0;
  await transport(
    page,
    (route) =>
      failReads
        ? route.fulfill({ status: 503, json: { error: "Read unavailable" } })
        : route.fulfill({ json: data }),
    async (route) => {
      posts++;
      data.orders[0].version++;
      data.orders[0].operational_status = "confirming";
      failReads = true;
      return route.fulfill({ json: { id: data.orders[0].id } });
    },
  );
  await page
    .getByRole("button", { name: "Aceitar pedido", exact: true })
    .click();
  const recovery = page.getByRole("region", { name: /^Ação do pedido/ });
  await expect(recovery).toContainText("A ação já foi registada");
  await expect(
    recovery.getByRole("button", { name: "Atualizar pedido" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Aceitar pedido", exact: true }),
  ).toBeDisabled();
  failReads = false;
  await recovery.getByRole("button", { name: "Atualizar pedido" }).click();
  await expect(recovery).toHaveCount(0);
  expect(posts).toBe(1);
});

test("a stale-version rejection requires a read before a new explicit command", async ({
  page,
}) => {
  const data = board();
  const calls: MerchantCommand[] = [];
  await transport(
    page,
    (route) => route.fulfill({ json: data }),
    async (route) => {
      calls.push(route.request().postDataJSON());
      if (calls.length === 1) {
        data.orders[0].version = 3;
        return route.fulfill({
          status: 409,
          json: { error: "O pedido mudou." },
        });
      }
      data.orders[0].operational_status = "confirming";
      return route.fulfill({ json: { id: data.orders[0].id } });
    },
  );
  await page
    .getByRole("button", { name: "Aceitar pedido", exact: true })
    .click();
  const recovery = page.getByRole("region", { name: /^Ação do pedido/ });
  await expect(recovery).toContainText("A ação foi recusada");
  await recovery.getByRole("button", { name: "Atualizar pedido" }).click();
  await expect(recovery).toHaveCount(0);
  expect(calls).toHaveLength(1);
  await page
    .getByRole("button", { name: "Aceitar pedido", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Ação registada",
  );
  expect(calls).toHaveLength(2);
  expect(calls[0].command_id).not.toBe(calls[1].command_id);
  expect(calls[1].expected_version).toBe(3);
});

for (const status of [408, 429, 503])
  test(`merchant keeps the original command after HTTP ${status}`, async ({
    page,
  }) => {
    const data = board();
    const calls: MerchantCommand[] = [];
    await transport(
      page,
      (route) => route.fulfill({ json: data }),
      async (route) => {
        calls.push(route.request().postDataJSON());
        if (calls.length === 1)
          return route.fulfill({
            status,
            json: { error: "Ainda sem confirmação" },
          });
        data.orders[0].operational_status = "confirming";
        return route.fulfill({ json: { id: data.orders[0].id } });
      },
    );
    await page
      .getByRole("button", { name: "Aceitar pedido", exact: true })
      .click();
    const recovery = page.getByRole("region", { name: /^Ação do pedido/ });
    await expect(
      recovery.getByRole("button", { name: "Repetir a mesma ação" }),
    ).toBeEnabled();
    await recovery
      .getByRole("button", { name: "Repetir a mesma ação" })
      .click();
    await expect(recovery).toHaveCount(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

test("return receipt recovery retains the same condition and saleable quantities after the form disappears", async ({
  page,
}) => {
  const data = board();
  data.orders[0].operational_status = "returned";
  data.orders[0].return_received_allowed = true;
  const calls: MerchantCommand[] = [];
  await transport(
    page,
    (route) => route.fulfill({ json: data }),
    async (route) => {
      calls.push(route.request().postDataJSON());
      data.orders[0].version = 3;
      data.orders[0].return_received_allowed = false;
      if (calls.length === 1) return route.abort("failed");
      return route.fulfill({ json: { id: data.orders[0].id } });
    },
  );
  await page.getByLabel("gelo · máximo 2").fill("1");
  await page.getByLabel("Condição da devolução").fill("Embalagem selada");
  await page
    .getByRole("button", { name: "Guardar receção e condição" })
    .click();
  const recovery = page.getByRole("region", { name: /^Ação do pedido/ });
  await expect(
    recovery.getByRole("button", { name: "Repetir a mesma ação" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Condição da devolução")).toBeDisabled();
  await page.clock.fastForward(5000);
  await expect(page.getByLabel("Condição da devolução")).toHaveCount(0);
  await recovery.getByRole("button", { name: "Repetir a mesma ação" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Receção guardada",
  );
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[0]).toMatchObject({
    command: "return_received",
    expected_version: 2,
    reason: "Embalagem selada",
    saleable: { gelo: 1 },
  });
});

test("a stale poll cannot restore the old state after a confirmed command refresh", async ({
  page,
}) => {
  const data = board();
  let holdNext = false;
  let held = false;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await transport(
    page,
    async (route) => {
      const body = JSON.stringify(data);
      if (holdNext) {
        holdNext = false;
        held = true;
        await pending;
      }
      return route.fulfill({ body, contentType: "application/json" });
    },
    async (route) => {
      data.orders[0].version = 3;
      data.orders[0].operational_status = "confirming";
      return route.fulfill({ json: { id: data.orders[0].id } });
    },
  );
  holdNext = true;
  await page.clock.fastForward(5000);
  await expect.poll(() => held).toBe(true);
  await page
    .getByRole("button", { name: "Aceitar pedido", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Ação registada",
  );
  const response = page.waitForResponse("**/api/merchant/orders");
  release();
  await response;
  await expect(
    page.getByRole("button", { name: "Aceitar pedido", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("article.commerce-card")).toContainText(
    "confirming",
  );
});

test("command access denial clears pending recovery controls and order data", async ({
  page,
}) => {
  const data = board();
  let posts = 0;
  await transport(
    page,
    (route) => route.fulfill({ json: data }),
    async (route) => {
      posts++;
      return posts === 1
        ? route.abort("failed")
        : route.fulfill({ status: 403, json: { error: "Não autorizado" } });
    },
  );
  await page
    .getByRole("button", { name: "Aceitar pedido", exact: true })
    .click();
  const retry = page.getByRole("button", { name: "Repetir a mesma ação" });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page.getByRole("main").getByRole("alert").first()).toContainText(
    "Inicia sessão novamente",
  );
  await expect(
    page.getByRole("region", { name: /^Ação do pedido/ }),
  ).toHaveCount(0);
  await expect(page.locator("article.commerce-card")).toHaveCount(0);
});
