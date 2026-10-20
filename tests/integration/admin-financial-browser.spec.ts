import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Explicit UI transports, never a real financial command or refund.
function detail() {
  return {
    order: {
      id: randomUUID(),
      version: 7,
      operational_status: "delivered",
      payment_status: "paid",
      settlement_status: "held",
    },
    remaining_refundable: 2600,
    remaining_components: { products: 2000, service: 200, delivery: 400 },
    refunds: [] as {
      id: string;
      amount: number;
      status: string;
      reason: string;
      allocation: { products: number; service: number; delivery: number };
    }[],
    events: [],
    cases: [],
    operations: [],
    jobs: [],
    notifications: [],
  };
}
async function prompts(page: Page) {
  const seen: string[] = [];
  page.on("dialog", (dialog) => {
    seen.push(dialog.type());
    return dialog.accept(
      dialog.type() === "prompt" ? "Artigo em falta" : undefined,
    );
  });
  return seen;
}
async function partial(page: Page) {
  await page.locator('input[name="products"]').fill("1.00");
  await page
    .getByRole("button", { name: "Rever e confirmar reembolso parcial" })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
}
test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("jola_age", "true"));
});

test("refund response loss retains one immutable command across polling, double clicks and retries", async ({
  page,
}) => {
  const data = detail(),
    dialogs = await prompts(page);
  const calls: Record<string, unknown>[] = [];
  await page.route(`**/api/admin/orders/${data.order.id}`, (route) =>
    route.fulfill({ json: data }),
  );
  await page.route(
    `**/api/admin/orders/${data.order.id}/commands`,
    async (route) => {
      calls.push(route.request().postDataJSON());
      if (calls.length === 1) {
        data.remaining_refundable -= 100;
        data.remaining_components.products -= 100;
        data.order.version++;
        return route.abort("failed");
      }
      return route.fulfill({ status: 202, json: { id: data.order.id } });
    },
  );
  await page.goto(`/admin/orders/${data.order.id}`);
  await expect(page.getByText(/Reembolsável:/)).toBeVisible();
  await partial(page);
  const recovery = page.getByRole("region", { name: "Ação em recuperação" });
  await expect(
    recovery.getByRole("button", { name: "Repetir a mesma ação" }),
  ).toBeEnabled();
  await page.clock.runFor(10000);
  await expect(page.getByText(/Reembolsável:/)).toContainText("25,00");
  await expect(
    page.getByRole("button", { name: "Rever e confirmar reembolso parcial" }),
  ).toBeDisabled();
  await expect(
    recovery.getByText(/Reembolso solicitado:.*Artigo em falta/),
  ).toBeVisible();
  await recovery.getByRole("button", { name: "Repetir a mesma ação" }).click();
  await expect(recovery).toHaveCount(0);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[0]).toMatchObject({
    command: "refund",
    expected_version: 7,
    reason: "Artigo em falta",
    amount: 100,
    allocation: { products: 100, service: 0, delivery: 0 },
    confirmed: true,
  });
  expect(dialogs).toEqual(["prompt", "confirm"]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => /refund|command|pending/.test(k)),
    ),
  ).toEqual([]);
});

test("an acknowledged refund with a failed refresh recovers by GET without another POST", async ({
  page,
}) => {
  const data = detail();
  await prompts(page);
  let posted = false,
    available = true,
    writes = 0;
  await page.route(`**/api/admin/orders/${data.order.id}`, (route) =>
    available
      ? route.fulfill({ json: data })
      : route.fulfill({
          status: 503,
          json: { error: "Temporariamente indisponível" },
        }),
  );
  await page.route(`**/api/admin/orders/${data.order.id}/commands`, (route) => {
    posted = true;
    writes++;
    available = false;
    return route.fulfill({ status: 202, json: { id: data.order.id } });
  });
  await page.goto(`/admin/orders/${data.order.id}`);
  await expect(page.getByText(/Reembolsável:/)).toBeVisible();
  await partial(page);
  const recovery = page.getByRole("region", { name: "Ação em recuperação" });
  await expect(
    recovery.getByRole("button", { name: "Atualizar pedido" }),
  ).toBeEnabled();
  expect(posted).toBe(true);
  available = true;
  await recovery.getByRole("button", { name: "Atualizar pedido" }).click();
  await expect(recovery).toHaveCount(0);
  expect(writes).toBe(1);
});

for (const status of [401, 403])
  test(`financial write ${status} removes protected data and stops polling`, async ({
    page,
  }) => {
    const data = detail();
    await prompts(page);
    let reads = 0,
      writes = 0;
    await page.route(`**/api/admin/orders/${data.order.id}`, (route) => {
      reads++;
      return route.fulfill({ json: data });
    });
    await page.route(
      `**/api/admin/orders/${data.order.id}/commands`,
      (route) => {
        writes++;
        return route.fulfill({ status, json: { error: "Sem acesso" } });
      },
    );
    await page.goto(`/admin/orders/${data.order.id}`);
    await expect(page.getByText(/Reembolsável:/)).toBeVisible();
    await partial(page);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Inicia sessão novamente",
    );
    await expect(page.getByText(/Reembolsável:/)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Ação em recuperação" }),
    ).toHaveCount(0);
    const previous = reads;
    await page.clock.runFor(30000);
    expect(reads).toBe(previous);
    expect(writes).toBe(1);
  });

test("an order read denial clears private balances even after a prior successful read", async ({
  page,
}) => {
  const data = detail();
  let authorized = true;
  await page.route(`**/api/admin/orders/${data.order.id}`, (route) =>
    authorized
      ? route.fulfill({ json: data })
      : route.fulfill({ status: 401, json: { error: "Sessão terminada" } }),
  );
  await page.goto(`/admin/orders/${data.order.id}`);
  await expect(page.getByText(/Reembolsável:/)).toBeVisible();
  authorized = false;
  await page.clock.runFor(10000);
  await expect(page.getByText(/Reembolsável:/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Rever reembolso total disponível" }),
  ).toHaveCount(0);
});
test("a pending provider refund remains visible after reload and prevents a new financial intent", async ({
  page,
}) => {
  const data = detail();
  data.refunds = [
    {
      id: randomUUID(),
      amount: 100,
      status: "unknown",
      reason: "Artigo em falta",
      allocation: { products: 100, service: 0, delivery: 0 },
    },
  ];
  let writes = 0;
  await page.route(`**/api/admin/orders/${data.order.id}`, (route) =>
    route.fulfill({ json: data }),
  );
  await page.route(`**/api/admin/orders/${data.order.id}/commands`, (route) => {
    writes++;
    return route.fulfill({ status: 202, json: {} });
  });
  await page.goto(`/admin/orders/${data.order.id}`);
  await page.reload();
  await expect(page.getByText(/Há um reembolso por confirmar/)).toBeVisible();
  await expect(page.getByText(/Resultado por confirmar/)).toBeVisible();
  await expect(
    page.getByText("Artigo em falta", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rever reembolso total disponível" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Rever e confirmar reembolso parcial" }),
  ).toBeDisabled();
  expect(writes).toBe(0);
});
test("a late pre-command poll cannot restore an old refundable balance", async ({
  page,
}) => {
  const data = detail();
  await prompts(page);
  let reads = 0;
  let holdNext = false;
  let release: (() => void) | undefined;
  await page.route(`**/api/admin/orders/${data.order.id}`, async (route) => {
    reads++;
    if (holdNext) {
      holdNext = false;
      const old = JSON.stringify(data);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return route.fulfill({ body: old, contentType: "application/json" });
    }
    return route.fulfill({ json: data });
  });
  await page.route(`**/api/admin/orders/${data.order.id}/commands`, (route) => {
    data.remaining_refundable -= 100;
    data.remaining_components.products -= 100;
    return route.fulfill({ status: 202, json: { id: data.order.id } });
  });
  await page.goto(`/admin/orders/${data.order.id}`);
  await expect(page.getByText(/Reembolsável:/)).toContainText("26,00");
  holdNext = true;
  await page.clock.runFor(10000);
  await expect.poll(() => typeof release).toBe("function");
  await partial(page);
  await expect(
    page.getByRole("region", { name: "Ação em recuperação" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Reembolsável:/)).toContainText("25,00");
  const latestReads = reads;
  const lateResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/admin/orders/${data.order.id}`),
  );
  release!();
  await (await lateResponse).finished();
  await page.clock.runFor(100);
  await expect(page.getByText(/Reembolsável:/)).toContainText("25,00");
  expect(reads).toBe(latestReads);
});
