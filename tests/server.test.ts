import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { leadSchema } from "@/lib/validation";

vi.mock("server-only", () => ({}));

import {
  fetchWithTimeout,
  getSupabase,
  isLocalStorage,
} from "@/lib/server/supabase";
import { apiError, RequestError } from "@/lib/server/http";

let directory: string;
let storage: typeof import("@/lib/server/storage");
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "jola-storage-test-"));
  vi.stubEnv("RUVON_DATA_DIR", path.relative(process.cwd(), directory));
  vi.stubEnv("RUVON_LOCAL_DEMO", "true");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  storage = await import("@/lib/server/storage");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("storage failures and retries", () => {
  it("aborts a stalled storage request at its deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener(
              "abort",
              () => reject(init.signal!.reason),
              { once: true },
            );
          }),
      ),
    );
    await expect(
      fetchWithTimeout("https://example.invalid", {}, 15),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("retains a caller's cancellation as well as the storage deadline", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener(
              "abort",
              () => reject(init.signal!.reason),
              { once: true },
            );
          }),
      ),
    );
    const request = fetchWithTimeout("https://example.invalid", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails closed on Vercel and on incomplete Supabase configuration", async () => {
    expect(getSupabase()).toBeNull();
    expect(isLocalStorage()).toBe(true);
    vi.stubEnv("VERCEL", "1");
    expect(isLocalStorage()).toBe(false);
    await expect(storage.readDatabase()).rejects.toThrow("Supabase");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    expect(() => getSupabase()).toThrow("incomplete");
    expect(isLocalStorage()).toBe(false);
  });

  it("keeps one merchant interest when the same submission is retried concurrently", async () => {
    const merchant = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      consent_at: new Date().toISOString(),
      store_name: "Loja de teste",
      contact_name: "Teste",
      city: "Lisboa",
      contact: "merchant@example.com",
    };
    await Promise.all([
      storage.saveMerchant(merchant),
      storage.saveMerchant(merchant),
    ]);
    const db = await storage.readDatabase();
    expect(
      db.merchant_interests.filter((entry) => entry.id === merchant.id),
    ).toHaveLength(1);
  });

  it("keeps the original basket evidence through city-only signup retries", async () => {
    const input = leadSchema.parse({
      session_id: randomUUID(),
      items: [{ id: "gelo", quantity: 2 }],
      location: { city: "Lisboa" },
      contact: "lead@example.com",
      consent: true,
      attribution: { utm_campaign: "original" },
    });
    await storage.saveLead(input);
    await storage.saveLead({ ...input, items: [], attribution: {} });
    const db = await storage.readDatabase();
    const leads = db.leads.filter(
      (entry) => entry.session_id === input.session_id,
    );
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      city: "Lisboa",
      postcode: "",
      basket_items: [{ id: "gelo", quantity: 2 }],
      utm_campaign: "original",
    });
    expect(leads[0].basket_total).toBeGreaterThan(0);
    expect(
      db.simulated_orders.find((entry) => entry.session_id === input.session_id)
        ?.converted_to_lead,
    ).toBe(true);
  });

  it("returns an actionable error without leaking storage error details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiError(new Error("private database credential"));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("Tenta novamente");
    expect(body.error).not.toContain("private");
    apiError({ code: "23514", message: "sensitive event properties" });
    expect(log).toHaveBeenLastCalledWith(
      "[Ruvon] Request failed:",
      "StorageError",
      "code=23514",
    );
    const limited = apiError(new RequestError("Espera um minuto.", 429));
    expect(limited.headers.get("Retry-After")).toBe("60");
  });
});
