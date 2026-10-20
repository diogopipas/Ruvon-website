import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { OperationsMonitor } from "@/lib/operations";

// Explicit browser transport fixtures: no real user/store or provider is created.
function snapshot(): OperationsMonitor {
  return {
    checked_at: new Date().toISOString(),
    configuration: {
      environment: "sandbox",
      checkout_exposed: false,
      easypay: false,
      uber: false,
      email: true,
    },
    worker: {
      last_started_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: null,
      jobs_processed: 0,
      healthy: true,
    },
    stores: [
      {
        id: randomUUID(),
        name: "Loja de teste local",
        enabled: true,
        paused: false,
        pause_reason: null,
        operations_version: 0,
        heartbeat_at: new Date().toISOString(),
        connected: true,
      },
    ],
    jobs: [
      {
        id: randomUUID(),
        order_id: null,
        kind: "external_event",
        state: "failed",
        attempts: 12,
        due_at: new Date().toISOString(),
        lease_expires_at: null,
        last_error: "retry_exhausted",
        can_retry: true,
      },
    ],
    events: [
      {
        id: randomUUID(),
        provider: "resend",
        event_identity: "msg_browser_fixture",
        resource_id: randomUUID(),
        state: "quarantined",
        processing_error: "UNMATCHED_NOTIFICATION",
        received_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      },
    ],
    operations: [],
    notifications: [],
    capabilities: [],
    audit: [],
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jola_age", "true"));
});

test("operations keeps one command identity after a lost response and guards disconnected stores", async ({
  page,
}, info) => {
  const data = snapshot();
  const commands: unknown[] = [];
  const validationRequests: string[] = [];
  page.on("request", (r) => {
    if (["/api/events", "/api/orders"].includes(new URL(r.url()).pathname))
      validationRequests.push(r.url());
  });
  await page.route("**/api/admin/operations", (route) =>
    route.fulfill({ json: data }),
  );
  await page.route("**/api/admin/operations/commands", async (route) => {
    commands.push(route.request().postDataJSON());
    data.stores[0] = {
      ...data.stores[0],
      paused: true,
      operations_version: 1,
      pause_reason: "OPERATIONS_PAUSED",
      connected: false,
    };
    if (commands.length === 1) return route.abort("failed");
    return route.fulfill({
      json: { id: data.stores[0].id, paused: true, version: 1 },
    });
  });
  await page.goto("/admin/orders/health");
  await expect(
    page.getByText("Worker saudável", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("UNMATCHED_NOTIFICATION", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pausar novos pedidos" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Indica o motivo",
  );
  expect(commands).toHaveLength(0);
  await page
    .getByLabel("Motivo da próxima ação")
    .fill("Teste de pausa auditada");
  await page.getByRole("button", { name: "Pausar novos pedidos" }).click();
  await expect(
    page.getByRole("button", { name: "Repetir a mesma ação" }),
  ).toBeVisible();
  await expect(page.getByLabel("Motivo da próxima ação")).toBeDisabled();
  await page.getByRole("button", { name: "Repetir a mesma ação" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Ação registada e estado atualizado",
  );
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(commands[0]).toMatchObject({
    action: "pause_store",
    target_id: data.stores[0].id,
    expected_version: 0,
    reason: "Teste de pausa auditada",
  });
  await expect(
    page.getByRole("button", { name: "Retomar novos pedidos" }),
  ).toBeDisabled();
  expect(validationRequests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("operations-mobile.png"),
    fullPage: true,
  });
});

for (const status of [401, 403])
  test(`operations removes protected records when polling returns ${status}`, async ({
    page,
  }) => {
    const data = snapshot();
    let authorized = true;
    await page.route("**/api/admin/operations", (route) =>
      authorized
        ? route.fulfill({ json: data })
        : route.fulfill({ status, json: { error: "Não autorizado" } }),
    );
    await page.goto("/admin/orders/health");
    await expect(
      page.getByRole("heading", { name: data.stores[0].name }),
    ).toBeVisible();
    authorized = false;
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Inicia sessão",
      {
        timeout: 15000,
      },
    );
    await expect(
      page.getByRole("heading", { name: data.stores[0].name }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Pausar novos pedidos" }),
    ).toHaveCount(0);
  });
