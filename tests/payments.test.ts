import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  mbwayPhoneSchema,
  paymentOrderSchema,
  providerCents,
  subtractPurchasedBasket,
} from "@/lib/payments";
import { priceBasket } from "@/lib/pricing";

vi.mock("server-only", () => ({}));
const browser = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  options: {} as Record<string, unknown>,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      browser.cookies.has(name)
        ? { value: browser.cookies.get(name) }
        : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      browser.cookies.set(name, value);
      browser.options = options;
    },
  }),
}));

import { POST as createOrder } from "@/app/api/payment-orders/route";
import { POST as payOrder } from "@/app/api/payment-orders/[id]/mbway/route";
import { GET as getOrder } from "@/app/api/payment-orders/[id]/route";
import { POST as webhook } from "@/app/api/webhooks/easypay/route";
import {
  sandboxRequested,
  sandboxDatabaseConfig,
} from "@/lib/server/payment-config";
import {
  verifyEasypayPayment,
  type EasypayPayment,
} from "@/lib/server/easypay";
import { paymentStore } from "@/lib/server/payment-store";

const db = new PGlite();
const provider = new Map<string, EasypayPayment>();
const createCalls: { key: string; body: Record<string, unknown> }[] = [];
let outcome:
  "paid" | "pending" | "failed" | "timeout-paid" | "timeout-empty" | "500" =
  "paid";
const origin = "http://localhost:3000";
const callbackAuth = `Basic ${Buffer.from(`jola-test:${"p".repeat(40)}`).toString("base64")}`;

beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role;",
  );
  await db.exec(
    await readFile("supabase/migrations/005_mbway_sandbox.sql", "utf8"),
  );
}, 20000);
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Transport fixtures only: all application pricing, ownership and state changes
 * execute through the actual Supabase client and the real migration/RPCs. */
async function transport(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "sandbox.supabase.co") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const rpc = url.pathname.split("/rpc/")[1];
    let result: unknown;
    if (rpc === "create_payment_order")
      result = (
        await db.query(
          "select public.create_payment_order($1::jsonb) as result",
          [JSON.stringify(body.p_data)],
        )
      ).rows[0];
    else if (rpc === "start_mbway_attempt")
      result = (
        await db.query(
          "select public.start_mbway_attempt($1::uuid,$2,$3,$4,$5) as result",
          [
            body.p_order_id,
            body.p_owner_hash,
            body.p_phone,
            body.p_email,
            body.p_retry,
          ],
        )
      ).rows[0];
    else if (rpc === "settle_mbway_attempt")
      result = (
        await db.query(
          "select public.settle_mbway_attempt($1::uuid,$2::uuid,$3,$4::timestamptz) as result",
          [
            body.p_attempt_id,
            body.p_provider_id,
            body.p_state,
            body.p_expires_at,
          ],
        )
      ).rows[0];
    else if (rpc === "claim_mbway_check")
      result = (
        await db.query("select public.claim_mbway_check($1::uuid) as result", [
          body.p_attempt_id,
        ])
      ).rows[0];
    else if (url.pathname.endsWith("/payment_orders")) {
      const id = url.searchParams.get("id")?.slice(3);
      const owner = url.searchParams.get("owner_hash")?.slice(3);
      return Response.json(
        (
          await db.query(
            "select * from public.payment_orders where id=$1::uuid and owner_hash=$2",
            [id, owner],
          )
        ).rows[0] ?? null,
      );
    } else if (url.pathname.endsWith("/payment_attempts")) {
      const id = url.searchParams.get("id")?.slice(3);
      return Response.json(
        (
          await db.query(
            'select a.*,to_jsonb(o) as "order" from public.payment_attempts a join public.payment_orders o on o.id=a.order_id where a.id=$1::uuid',
            [id],
          )
        ).rows[0] ?? null,
      );
    } else throw new Error(`Unexpected test database path ${url.pathname}`);
    return Response.json((result as { result: unknown }).result);
  }
  expect(url.origin).toBe("https://api.test.easypay.pt");
  if (init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    const key = new Headers(init.headers).get("Idempotency-Key")!;
    createCalls.push({ key, body });
    if (outcome === "500") return Response.json({}, { status: 500 });
    if (outcome === "timeout-empty") throw new TypeError("network error");
    const payment: EasypayPayment = {
      id: randomUUID(),
      key: body.key,
      value: body.value,
      currency: "EUR",
      method: { type: "MBW", status: "active" },
      payment_status: outcome === "timeout-paid" ? "paid" : outcome,
    };
    provider.set(payment.id, payment);
    if (outcome === "timeout-paid")
      throw new TypeError("response lost after payment creation");
    return Response.json({ status: "ok", id: payment.id });
  }
  if (url.searchParams.has("key"))
    return Response.json({
      data: [...provider.values()].filter(
        (p) => p.key === url.searchParams.get("key"),
      ),
    });
  const payment = provider.get(url.pathname.split("/").at(-1)!);
  return payment ? Response.json(payment) : Response.json({}, { status: 404 });
}

beforeEach(() => {
  vi.stubEnv("JOLA_PAYMENTS_MODE", "sandbox");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("EASYPAY_ACCOUNT_ID", randomUUID());
  vi.stubEnv("EASYPAY_API_KEY", "synthetic-test-key");
  vi.stubEnv("EASYPAY_WEBHOOK_USERNAME", "jola-test");
  vi.stubEnv("EASYPAY_WEBHOOK_PASSWORD", "p".repeat(40));
  vi.stubEnv("JOLA_SANDBOX_SUPABASE_URL", "https://sandbox.supabase.co");
  vi.stubEnv("JOLA_SANDBOX_SUPABASE_SERVICE_ROLE_KEY", "synthetic-sandbox-key");
  vi.stubEnv("SUPABASE_URL", "https://production.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-production-key");
  vi.stubGlobal("fetch", vi.fn(transport));
  browser.cookies.clear();
  browser.options = {};
  createCalls.length = 0;
  provider.clear();
  outcome = "paid";
});

function request(path: string, body?: unknown, authorization?: string) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
function fixture() {
  return {
    checkout_key: randomUUID(),
    age_confirmed: true,
    location: { city: "Lisboa" },
    items: [
      {
        id: "pack-classica",
        quantity: 1,
        options: { mixer: "seven-up", mixer2: "coca-cola-zero", ice: "none" },
      },
    ],
  };
}
async function quote() {
  const response = await createOrder(request("/api/payment-orders", fixture()));
  expect(response.status).toBe(201);
  return response.json();
}
async function pay(id: string, retry = false) {
  return payOrder(
    request(`/api/payment-orders/${id}/mbway`, {
      phone: "911234567",
      email: "",
      retry,
    }),
    context(id),
  );
}
async function read(id: string) {
  return getOrder(
    new Request(`${origin}/api/payment-orders/${id}`),
    context(id),
  );
}
async function unlockCheck(id: string) {
  await db.query(
    "update public.payment_attempts set last_checked_at=null where order_id=$1::uuid",
    [id],
  );
}
async function notify(payment: EasypayPayment, status = "success") {
  return webhook(
    request(
      "/api/webhooks/easypay",
      { id: payment.id, key: payment.key, type: "capture", status },
      callbackAuth,
    ),
  );
}

describe("MB WAY sandbox payment flow", () => {
  it("prices a customized pack on the server and establishes a private cookie before charging", async () => {
    const input = fixture();
    input.items[0] = { ...input.items[0], price: 1 } as (typeof input.items)[0];
    const response = await createOrder(request("/api/payment-orders", input));
    const saved = await response.json();
    expect(saved.total).toBe(
      priceBasket(paymentOrderSchema.parse(input).items).total,
    );
    expect(saved.items[0].contents).toContain("1 × 7Up 1,75 L");
    expect(saved.items[0].removed_extras).toContain("ice");
    expect(saved.items[0].options.vodka).toBe("absolut");
    expect(browser.options).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/api/payment-orders",
    });
    expect(createCalls).toHaveLength(0);
    expect(saved).not.toHaveProperty("owner_hash");
    expect(
      (
        await createOrder(
          request("/api/payment-orders", { ...fixture(), total: 1 }),
        )
      ).status,
    ).toBe(400);
  });

  it("replays order creation without altering a quote and rejects a changed basket under the same key", async () => {
    const input = fixture();
    const first = await (
      await createOrder(request("/api/payment-orders", input))
    ).json();
    const second = await (
      await createOrder(request("/api/payment-orders", input))
    ).json();
    expect(second.id).toBe(first.id);
    // Supabase error contract on SQL 23505 is covered directly below.
    await expect(
      db.query("select public.create_payment_order($1::jsonb)", [
        JSON.stringify({
          ...(
            await db.query<Record<string, unknown>>(
              "select * from public.payment_orders where id=$1",
              [first.id],
            )
          ).rows[0],
          snapshot_hash: "different",
        }),
      ]),
    ).rejects.toThrow("quote_conflict");
  });

  it("completes payment only after authoritative GET and repeated clicks cannot create another charge", async () => {
    const order = await quote();
    const first = await (await pay(order.id)).json();
    expect(first.state).toBe("paid");
    expect((await (await pay(order.id)).json()).state).toBe("paid");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].key).toBe(createCalls[0].body.key);
    expect(createCalls[0].body).toMatchObject({
      type: "sale",
      method: "MBW",
      currency: "EUR",
      value: order.total / 100,
    });
    expect(first.phone_suffix).toBe("567");
    expect(JSON.stringify(first)).not.toContain("911234567");
    expect((await (await read(order.id)).json()).state).toBe("paid");
  });

  it("concurrent payment clicks share one durable attempt", async () => {
    outcome = "pending";
    const order = await quote();
    await Promise.all([pay(order.id), pay(order.id)]);
    expect(createCalls).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.payment_attempts where order_id=$1",
          [order.id],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("creation ok stays pending and a forged amount/currency/key/method can never mark paid", async () => {
    outcome = "pending";
    const order = await quote();
    expect((await (await pay(order.id)).json()).state).toBe("pending");
    const payment = [...provider.values()][0];
    const attempt = await paymentStore().attempt(payment.key);
    for (const change of [
      { value: 1 },
      { currency: "USD" },
      { key: randomUUID() },
      { id: randomUUID() },
      { method: { type: "CC" } },
    ]) {
      expect(() =>
        verifyEasypayPayment(
          { ...payment, payment_status: "paid", ...change },
          attempt!.order,
          attempt!,
        ),
      ).toThrow();
    }
    payment.payment_status = "paid";
    payment.value = 1;
    expect((await notify(payment)).status).toBe(503);
    expect((await (await read(order.id)).json()).state).not.toBe("paid");
  });

  it("recovers a lost creation response through lookup without another POST", async () => {
    outcome = "timeout-paid";
    const order = await quote();
    expect((await (await pay(order.id)).json()).state).toBe("reconciling");
    await unlockCheck(order.id);
    expect((await (await read(order.id)).json()).state).toBe("paid");
    expect(createCalls).toHaveLength(1);
  });

  it.each(["timeout-empty", "500"] as const)(
    "keeps %s ambiguous and blocks a second attempt",
    async (failure) => {
      outcome = failure;
      const order = await quote();
      expect((await (await pay(order.id)).json()).state).toBe("reconciling");
      await pay(order.id, true);
      await unlockCheck(order.id);
      await read(order.id);
      expect(createCalls).toHaveLength(1);
      expect(
        (
          await db.query(
            "select state from public.payment_orders where id=$1",
            [order.id],
          )
        ).rows[0],
      ).toMatchObject({ state: "reconciling" });
    },
  );

  it("accepts verified callbacks without a browser Origin, ignores duplicates/stale failure and preserves paid", async () => {
    outcome = "pending";
    const order = await quote();
    await pay(order.id);
    const payment = [...provider.values()][0];
    payment.payment_status = "paid";
    const payload = {
      id: payment.id,
      key: payment.key,
      type: "capture",
      status: "success",
    };
    const noOrigin = new Request(`${origin}/api/webhooks/easypay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: callbackAuth,
      },
      body: JSON.stringify(payload),
    });
    expect((await webhook(noOrigin)).status).toBe(200);
    const paidAt = (
      await db.query("select paid_at from public.payment_orders where id=$1", [
        order.id,
      ])
    ).rows[0];
    expect((await notify(payment)).status).toBe(200);
    payment.payment_status = "failed";
    expect((await notify(payment, "failed")).status).toBe(200);
    expect((await (await read(order.id)).json()).state).toBe("paid");
    expect(
      (
        await db.query(
          "select paid_at from public.payment_orders where id=$1",
          [order.id],
        )
      ).rows[0],
    ).toEqual(paidAt);
    expect(
      (
        await db.query(
          "select * from public.payment_attempts where order_id=$1",
          [order.id],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("requires callback authentication and does not acknowledge transient provider failures", async () => {
    outcome = "pending";
    const order = await quote();
    await pay(order.id);
    const payment = [...provider.values()][0];
    expect(
      (
        await webhook(
          request("/api/webhooks/easypay", {
            id: payment.id,
            key: payment.key,
            type: "capture",
            status: "success",
          }),
        )
      ).status,
    ).toBe(401);
    provider.clear();
    expect((await notify(payment)).status).toBe(503);
  });

  it("failure permits one explicit retry with a fresh idempotency key", async () => {
    outcome = "failed";
    const order = await quote();
    expect((await (await pay(order.id)).json()).state).toBe("failed");
    await pay(order.id);
    expect(createCalls).toHaveLength(1);
    outcome = "paid";
    expect((await (await pay(order.id, true)).json()).state).toBe("paid");
    expect(createCalls).toHaveLength(2);
    expect(createCalls[1].key).not.toBe(createCalls[0].key);
  });

  it("only provider-confirmed expiry permits retry; elapsed local time cannot", async () => {
    outcome = "pending";
    const order = await quote();
    await pay(order.id);
    const payment = [...provider.values()][0];
    payment.expiration_time = "2020-01-01T00:00:00Z";
    await unlockCheck(order.id);
    expect((await (await read(order.id)).json()).state).toBe("pending");
    payment.payment_status = "timeout";
    const attempt = await paymentStore().attempt(payment.key);
    // The sandbox's undocumented status needs corroborating capture evidence.
    for (const captures of [
      undefined,
      [{ status: "waiting", value: order.total / 100 }],
      [{ status: "failed", value: 1 }],
    ]) {
      expect(
        verifyEasypayPayment({ ...payment, captures }, attempt!.order, attempt!)
          .state,
      ).toBe("reconciling");
    }
    payment.captures = [{ status: "failed", value: order.total / 100 }];
    expect((await notify(payment, "failed")).status).toBe(200);
    expect((await (await read(order.id)).json()).state).toBe("expired");
    expect((await (await pay(order.id, true)).json()).state).toBe("pending");
    expect(createCalls).toHaveLength(2);
  });

  it("a browser UUID is insufficient to read or charge another customer's order", async () => {
    const order = await quote();
    browser.cookies.clear();
    expect((await read(order.id)).status).toBe(404);
    expect((await pay(order.id)).status).toBe(404);
    await quote();
    expect((await read(order.id)).status).toBe(404);
    expect((await pay(order.id)).status).toBe(404);
    expect(createCalls).toHaveLength(0);
  });

  it("rejects cross-origin or origin-less payment creation", async () => {
    const cross = request("/api/payment-orders", fixture());
    cross.headers.set("origin", "https://other.example");
    expect((await createOrder(cross)).status).toBe(403);
    const missing = request("/api/payment-orders", fixture());
    missing.headers.delete("origin");
    expect((await createOrder(missing)).status).toBe(403);
  });

  it("blocks every payment route in production despite the sandbox flag", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    const id = randomUUID();
    expect(sandboxRequested()).toBe(false);
    expect(
      (await createOrder(request("/api/payment-orders", fixture()))).status,
    ).toBe(404);
    expect((await pay(id)).status).toBe(404);
    expect((await read(id)).status).toBe(404);
    expect(
      (await webhook(request("/api/webhooks/easypay", {}, callbackAuth)))
        .status,
    ).toBe(404);
    expect(createCalls).toHaveLength(0);
  });

  it("fails closed when the test database is missing or aliases production", async () => {
    vi.stubEnv("JOLA_SANDBOX_SUPABASE_URL", "");
    expect(() => sandboxDatabaseConfig()).toThrow("base de dados");
    vi.stubEnv("JOLA_SANDBOX_SUPABASE_URL", "https://production.supabase.co/");
    expect(() => sandboxDatabaseConfig()).toThrow("separado");
    vi.stubEnv("JOLA_SANDBOX_SUPABASE_URL", "https://sandbox.supabase.co");
    vi.stubEnv(
      "JOLA_SANDBOX_SUPABASE_SERVICE_ROLE_KEY",
      "synthetic-production-key",
    );
    expect(() => sandboxDatabaseConfig()).toThrow("separado");
  });

  it("makes the quote and contact immutable and denies anonymous table/RPC access", async () => {
    const order = await quote();
    await pay(order.id);
    await expect(
      db.query(
        "update public.payment_orders set total=total+1,subtotal=subtotal+1 where id=$1",
        [order.id],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      db.query(
        "update public.payment_attempts set phone='917654321' where order_id=$1",
        [order.id],
      ),
    ).rejects.toThrow("immutable");
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select * from public.payment_orders"),
      ).rejects.toThrow();
      await expect(
        db.query("select public.create_payment_order('{}'::jsonb)"),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("payment amounts and browser basket", () => {
  it("normalizes Portuguese mobile numbers and refuses landlines", () => {
    expect(mbwayPhoneSchema.parse("+351 911 234 567")).toBe("911234567");
    expect(mbwayPhoneSchema.safeParse("212345678").success).toBe(false);
    expect(mbwayPhoneSchema.safeParse("+34911234567").success).toBe(false);
  });
  it("refuses ambiguous or fractional provider amounts", () => {
    expect(providerCents("21.49")).toBe(2149);
    expect(providerCents(21.49)).toBe(2149);
    for (const value of ["21.499", "1e2", "-1", NaN, "21,49", " EUR 21.49"])
      expect(providerCents(value)).toBeNull();
  });
  it("removes only purchased quantities/configurations and keeps unrelated/new units", () => {
    const pack = {
      id: "pack-classica",
      quantity: 1,
      options: { vodka: "absolut" as const },
    };
    expect(
      subtractPurchasedBasket(
        [
          { ...pack, quantity: 3 },
          { id: "gelo", quantity: 2 },
        ],
        [pack],
      ),
    ).toEqual([
      { ...pack, quantity: 2 },
      { id: "gelo", quantity: 2 },
    ]);
    const changed = { ...pack, options: { vodka: "smirnoff" as const } };
    expect(subtractPurchasedBasket([changed], [pack])).toEqual([changed]);
  });
});
