import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
vi.mock("server-only", () => ({}));
import { EasypayProvider } from "@/lib/server/payments/easypay";
import { UberDirectProvider } from "@/lib/server/delivery/uber-direct";
import { verifyUberSignature } from "@/lib/server/webhooks/inbox";
import { deliveryFact } from "@/lib/server/delivery/facts";
import type { ProviderOperation } from "@/lib/server/payments/provider";
import { confirmCommerceCart, parseCommerceCart } from "@/lib/commerce-cart";
import { uberConfig } from "@/lib/server/commerce-config";

const fetcher = vi.fn();
beforeEach(() => {
  vi.stubEnv("RUVON_PAYMENTS_MODE", "sandbox");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("EASYPAY_ACCOUNT_ID", randomUUID());
  vi.stubEnv("EASYPAY_API_KEY", "test-only");
  vi.stubEnv("EASYPAY_MARKETPLACE_ACCOUNT_ID", randomUUID());
  vi.stubEnv("RUVON_DELIVERY_MODE", "sandbox");
  vi.stubEnv("UBER_DIRECT_CLIENT_ID", undefined);
  vi.stubEnv("UBER_DIRECT_SECRET", undefined);
  vi.stubEnv("UBER_DIRECT_CUSTOMER_ID", undefined);
  vi.stubEnv("UBER_CLIENT_ID", randomUUID());
  vi.stubEnv("UBER_CLIENT_SECRET", "test-only");
  vi.stubEnv("UBER_CUSTOMER_ID", "test-customer");
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function operation(
  kind: ProviderOperation["kind"] = "authorise",
): ProviderOperation {
  const attempt = randomUUID();
  return {
    id: randomUUID(),
    provider: "easypay",
    account: process.env.EASYPAY_ACCOUNT_ID!,
    environment: "sandbox",
    kind,
    order_id: randomUUID(),
    attempt_id: attempt,
    logical_key: `${kind}:${attempt}`,
    idempotency_key: attempt,
    request: {
      path: "/single",
      method: "POST",
      amount: 4600,
      body: {
        type: "authorisation",
        method: "MBW",
        value: 46,
        currency: "EUR",
        key: attempt,
      },
    },
    request_hash: "test",
    status: "created",
    provider_resource_id: null,
    retry_safe_until: null,
    created_at: new Date().toISOString(),
  };
}
function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}
function deliveryOperation(): ProviderOperation {
  const op = operation("delivery_create");
  op.provider = "uber";
  op.account = process.env.UBER_CUSTOMER_ID!;
  op.request = {
    path: "/deliveries",
    method: "POST",
    body: {
      quote_id: "dqt_test",
      external_id: op.order_id,
      idempotency_key: op.idempotency_key,
      test_specifications: { robo_courier_specification: { mode: "auto" } },
    },
  };
  return op;
}
describe("documented provider transport contracts (synthetic fixtures)", () => {
  it("uses the new Uber Direct names for OAuth and customer routing while preserving legacy compatibility", async () => {
    const customer = randomUUID(),
      client = randomUUID();
    vi.stubEnv("UBER_DIRECT_CUSTOMER_ID", customer);
    vi.stubEnv("UBER_DIRECT_CLIENT_ID", client);
    vi.stubEnv("UBER_DIRECT_SECRET", "new-test-secret");
    fetcher
      .mockResolvedValueOnce(
        json({ access_token: "new-test-token", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        json({
          id: "dqt_test",
          currency: "eur",
          fee: 400,
          expires: new Date(Date.now() + 600000).toISOString(),
          dropoff_eta: new Date(Date.now() + 1200000).toISOString(),
        }),
      );
    const pickup = {
      street_address: ["Rua A, 1"],
      city: "Lisboa",
      state: "Lisboa",
      zip_code: "1000-001",
      country: "PT" as const,
    };
    await new UberDirectProvider().quote(pickup, {
      ...pickup,
      street_address: ["Rua B, 2"],
    });
    const form = new URLSearchParams(fetcher.mock.calls[0][1].body);
    expect(form.get("client_id")).toBe(client);
    expect(form.get("client_secret")).toBe("new-test-secret");
    expect(form.get("scope")).toBe("eats.deliveries");
    expect(fetcher.mock.calls[1][0]).toBe(
      `https://api.uber.com/v1/customers/${customer}/delivery_quotes`,
    );
  });
  it("does not fall back to legacy credentials when a new Uber variable is explicitly blank", () => {
    vi.stubEnv("UBER_DIRECT_SECRET", " ");
    expect(() => uberConfig()).toThrow("Configuração operacional incompleta.");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps delivery disabled even with a complete set of new Uber credentials", () => {
    vi.stubEnv("UBER_DIRECT_CLIENT_ID", randomUUID());
    vi.stubEnv("UBER_DIRECT_SECRET", "test-secret");
    vi.stubEnv("UBER_DIRECT_CUSTOMER_ID", randomUUID());
    vi.stubEnv("RUVON_DELIVERY_MODE", "disabled");
    expect(() => new UberDirectProvider()).toThrow("Entregas indisponíveis.");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reuses an Uber token only for the same credentials and environment", async () => {
    const client = randomUUID();
    vi.stubEnv("UBER_DIRECT_CLIENT_ID", client);
    vi.stubEnv("UBER_DIRECT_SECRET", "test-secret-one");
    fetcher
      .mockResolvedValueOnce(
        json({ access_token: "first-token", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(json({ status: "fixture" }))
      .mockResolvedValueOnce(json({ status: "cached" }));
    const provider = new UberDirectProvider();
    await provider.request("/deliveries/del_fixture");
    await new UberDirectProvider().request("/deliveries/del_fixture");
    vi.stubEnv("UBER_DIRECT_SECRET", "test-secret-two");
    fetcher
      .mockResolvedValueOnce(
        json({ access_token: "second-token", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(json({ status: "fixture" }));
    await new UberDirectProvider().request("/deliveries/del_fixture");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RUVON_PAYMENTS_MODE", "live");
    vi.stubEnv("RUVON_DELIVERY_MODE", "live");
    fetcher
      .mockResolvedValueOnce(
        json({ access_token: "live-token", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(json({ status: "fixture" }));
    await new UberDirectProvider().request("/deliveries/del_fixture");
    const tokenRequests = fetcher.mock.calls.filter(
      (c) => c[0] === "https://auth.uber.com/oauth/v2/token",
    );
    expect(tokenRequests).toHaveLength(3);
    expect(
      tokenRequests.map((c) =>
        new URLSearchParams(c[1].body).get("client_secret"),
      ),
    ).toEqual(["test-secret-one", "test-secret-two", "test-secret-two"]);
    expect(
      fetcher.mock.calls
        .filter((c) => c[0].includes("api.uber.com"))
        .map((c) => c[1].headers.Authorization),
    ).toEqual([
      "Bearer first-token",
      "Bearer first-token",
      "Bearer second-token",
      "Bearer live-token",
    ]);
  });
  it("authorises MB WAY without silently changing to a sale and verifies the provider GET", async () => {
    const op = operation(),
      id = randomUUID();
    fetcher.mockResolvedValueOnce(json({ id })).mockResolvedValueOnce(
      json({
        id,
        key: op.attempt_id,
        currency: "EUR",
        method: { type: "MBW" },
        value: 46,
        type: "authorisation",
        payment_status: "authorised",
        captures: [],
      }),
    );
    const fact = await new EasypayProvider().mutate(op);
    expect(fact).toMatchObject({
      state: "succeeded",
      resource_id: id,
      amount: 4600,
    });
    expect(fact.expires_at).toBeUndefined();
    expect(JSON.parse(fetcher.mock.calls[0][1].body).type).toBe(
      "authorisation",
    );
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      op.idempotency_key,
    );
    expect(fetcher.mock.calls[1][0]).toContain(`/single/${id}`);
  });
  it("does not equate a creation response with authorised funds", async () => {
    const op = operation(),
      id = randomUUID();
    fetcher
      .mockResolvedValueOnce(json({ id, status: "ok" }))
      .mockResolvedValueOnce(
        json({
          id,
          key: op.attempt_id,
          currency: "EUR",
          method: { type: "MBW" },
          value: 46,
          type: "authorisation",
          payment_status: "pending",
        }),
      );
    expect((await new EasypayProvider().mutate(op)).state).toBe("pending");
  });
  it("retains an unknown authorisation after a lost response and reconciles by its original key", async () => {
    const op = operation(),
      id = randomUUID();
    fetcher.mockRejectedValueOnce(new Error("lost"));
    const provider = new EasypayProvider();
    expect((await provider.mutate(op)).state).toBe("unknown");
    fetcher.mockResolvedValueOnce(
      json({
        data: [
          {
            id,
            key: op.attempt_id,
            currency: "EUR",
            method: { type: "MBW" },
            value: 46,
            type: "authorisation",
            payment_status: "authorised",
          },
        ],
      }),
    );
    expect((await provider.reconcile(op)).resource_id).toBe(id);
    expect(
      fetcher.mock.calls.filter((c) => c[1].method === "POST"),
    ).toHaveLength(1);
  });
  it("rejects a foreign key, different method, wrong amount or unexpected capture", async () => {
    for (const patch of [
      { key: randomUUID() },
      { method: { type: "CC" } },
      { value: 47 },
      { captures: [{ id: randomUUID(), status: "success" }] },
    ]) {
      const op = operation(),
        id = randomUUID();
      fetcher.mockResolvedValueOnce(
        json({
          id,
          key: op.attempt_id,
          currency: "EUR",
          method: { type: "MBW" },
          value: 46,
          type: "authorisation",
          payment_status: "authorised",
          ...patch,
        }),
      );
      expect(
        (
          await new EasypayProvider().reconcile({
            ...op,
            provider_resource_id: id,
          })
        ).state,
      ).toBe("unknown");
    }
  });
  it("returns a hosted card manifest as pending and verifies the related Single authorisation", async () => {
    const op = operation();
    op.request.path = "/checkout";
    op.request.body = {
      type: ["single"],
      payment: {
        methods: ["CC"],
        type: "authorisation",
        currency: "EUR",
        key: op.attempt_id,
      },
      order: { key: op.attempt_id, value: 46 },
    };
    const checkout = randomUUID(),
      payment = randomUUID();
    fetcher.mockResolvedValueOnce(
      json({ id: checkout, session: "private-session", config: {} }),
    );
    const provider = new EasypayProvider(),
      created = await provider.mutate(op);
    expect(created.state).toBe("pending");
    fetcher
      .mockResolvedValueOnce(
        json({
          checkout: { id: checkout, status: "complete" },
          payment: { id: payment, key: op.attempt_id },
        }),
      )
      .mockResolvedValueOnce(
        json({
          id: payment,
          key: op.attempt_id,
          method: { type: "CC" },
          currency: "EUR",
          value: 46,
          type: "authorisation",
          payment_status: "authorised",
        }),
      );
    expect(
      (
        await provider.reconcile({
          ...op,
          checkout_manifest:
            created.checkout_manifest as ProviderOperation["checkout_manifest"],
        })
      ).state,
    ).toBe("succeeded");
  });
  it("routes a void to its own resource and verifies the authorisation relationship", async () => {
    const op = operation("void"),
      parent = randomUUID(),
      id = randomUUID();
    op.request = {
      path: `/void/${parent}`,
      method: "POST",
      parent_id: parent,
      body: { transaction_key: op.idempotency_key },
    };
    fetcher
      .mockResolvedValueOnce(json({ id }))
      .mockResolvedValueOnce(
        json({
          id,
          status: "success",
          transaction_key: op.idempotency_key,
          authorisation: {
            id: randomUUID(),
            key: op.attempt_id,
            currency: "EUR",
            method: { type: "MBW" },
            value: 46,
          },
        }),
      )
      .mockResolvedValueOnce(
        json(singleFact(op, parent, { payment_status: "voided" })),
      );
    expect((await new EasypayProvider().mutate(op)).state).toBe("succeeded");
    expect(fetcher.mock.calls[1][0]).toContain(`/void/${id}`);
  });
  it("keeps asynchronous refunds pending and checks the captured parent", async () => {
    const op = operation("refund"),
      parent = randomUUID(),
      id = randomUUID();
    op.request = {
      path: `/refund/${parent}`,
      method: "POST",
      parent_id: parent,
      body: { value: 10, transaction_key: op.idempotency_key },
    };
    fetcher.mockResolvedValueOnce(
      json({
        id,
        status: "pending",
        value: 10,
        transaction_key: op.idempotency_key,
        capture: { id: parent },
      }),
    );
    expect(
      await new EasypayProvider().reconcile({
        ...op,
        provider_resource_id: id,
      }),
    ).toMatchObject({ state: "pending", amount: 1000 });
  });
  it("never reposts an unknown Uber booking without a correlated delivery ID", async () => {
    const op = deliveryOperation();
    fetcher
      .mockResolvedValueOnce(
        json({ access_token: "test-token", expires_in: 3600 }),
      )
      .mockRejectedValueOnce(new Error("lost"));
    const provider = new UberDirectProvider();
    expect((await provider.mutate(op)).state).toBe("unknown");
    expect((await provider.reconcile(op)).error_class).toBe(
      "booking_identity_unknown",
    );
    expect(fetcher.mock.calls).toHaveLength(2);
  });
  it("rejects a booking correlated to a different order", async () => {
    const op = deliveryOperation();
    fetcher
      .mockResolvedValueOnce(
        json({ access_token: "test-token", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        json({
          id: "del_test",
          status: "pending",
          live_mode: false,
          currency: "EUR",
          fee: 400,
          quote_id: "dqt_test",
          external_id: randomUUID(),
        }),
      );
    expect((await new UberDirectProvider().mutate(op)).state).toBe("unknown");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("blocks a foreign Uber account/environment before booking or reconciliation", async () => {
    for (const patch of [
      { account: randomUUID() },
      { environment: "live" as const },
      { provider: "easypay" as const },
    ]) {
      const op = { ...deliveryOperation(), ...patch },
        provider = new UberDirectProvider();
      expect(await provider.mutate(op)).toMatchObject({
        state: "unknown",
        error_class: "delivery_configuration_conflict",
      });
      await expect(provider.reconcile(op)).rejects.toThrow(
        "delivery_configuration_conflict",
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses changed Uber keys, identities, paths and sandbox bookings without Robo Courier", async () => {
    for (const change of [
      (op: ProviderOperation) => {
        op.request.body.idempotency_key = randomUUID();
      },
      (op: ProviderOperation) => {
        op.request.body.external_id = randomUUID();
      },
      (op: ProviderOperation) => {
        op.request.path = "/deliveries/del_other/cancel";
      },
      (op: ProviderOperation) => {
        delete op.request.body.test_specifications;
      },
    ]) {
      const op = deliveryOperation();
      change(op);
      expect((await new UberDirectProvider().mutate(op)).state).toBe("unknown");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("verifies HMAC over exact Unicode bytes and discards identification details", () => {
    const raw = Buffer.from('{"name":"João — ação"}'),
      key = "test-signing-key",
      signature = createHmac("sha256", key).update(raw).digest("hex");
    expect(verifyUberSignature(raw, signature, key)).toBe(true);
    expect(
      verifyUberSignature(
        Buffer.concat([raw, Buffer.from(" ")]),
        signature,
        key,
      ),
    ).toBe(false);
    expect(verifyUberSignature(raw, "", key)).toBe(false);
    expect(
      deliveryFact({
        id: "ret_test",
        status: "delivered",
        related_deliveries: [{ id: "del_original", relationship: "original" }],
        dropoff: {
          verification: {
            identification: {
              min_age_verified: true,
              document_number: "discard",
              date_of_birth: "discard",
            },
          },
        },
      }),
    ).toEqual({
      id: "ret_test",
      status: "delivered",
      eta: undefined,
      parent_id: "del_original",
      return_id: undefined,
      verification_passed: true,
    });
  });
  it("commits purchased quantities and deduplication together while preserving other additions", () => {
    const id = randomUUID(),
      cart = parseCommerceCart({
        items: [
          { id: "gelo", quantity: 4 },
          { id: "coca-cola", quantity: 1 },
        ],
        confirmedOrders: [],
      });
    const next = confirmCommerceCart(cart, id, [{ id: "gelo", quantity: 2 }]);
    expect(next.items).toEqual([
      { id: "gelo", quantity: 2 },
      { id: "coca-cola", quantity: 1 },
    ]);
    expect(confirmCommerceCart(next, id, [{ id: "gelo", quantity: 2 }])).toBe(
      next,
    );
  });
});

function singleFact(op: ProviderOperation, id: string, patch = {}) {
  return {
    id,
    type: "authorisation",
    key: op.attempt_id,
    currency: "EUR",
    method: { type: "MBW" },
    value: 46,
    payment_status: "authorised",
    captures: [],
    ...patch,
  };
}
function captureOperation() {
  const op = operation("capture"),
    parent = randomUUID();
  op.idempotency_key = randomUUID();
  op.request = {
    path: `/capture/${parent}`,
    method: "POST",
    parent_id: parent,
    body: {
      transaction_key: op.idempotency_key,
      value: 46,
      splits: [
        { split_key: "merchant", account: { id: randomUUID() }, value: 36 },
        { split_key: "ruvon", account: { id: randomUUID() }, value: 10 },
      ],
    },
  };
  return op;
}
function captureFact(op: ProviderOperation, id: string) {
  const splits = op.request.body.splits as {
    split_key: string;
    account: { id: string };
    value: number;
  }[];
  return {
    id,
    payment_type: "single",
    payment_id: op.request.parent_id,
    transaction_key: op.idempotency_key,
    value: 46,
    status: "success",
    splits: splits.map((s) => ({
      ...s,
      id: randomUUID(),
      clearing_date: "2026-11-07",
    })),
  };
}

describe("Easypay financial identity and recovery guards", () => {
  it("blocks foreign accounts/environments before any provider call", async () => {
    for (const patch of [
      { account: randomUUID() },
      { environment: "live" as const },
    ]) {
      const op = { ...operation(), ...patch };
      const provider = new EasypayProvider();
      expect(await provider.mutate(op)).toMatchObject({
        state: "unknown",
        error_class: "payment_configuration_conflict",
      });
      expect(await provider.reconcile(op)).toMatchObject({
        state: "unknown",
        error_class: "payment_configuration_conflict",
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses sale, wrong keys/totals, unsupported methods and destinations without sending money", async () => {
    const changes = [
      (op: ProviderOperation) => {
        op.request.body.type = "sale";
      },
      (op: ProviderOperation) => {
        op.request.body.method = "CC";
      },
      (op: ProviderOperation) => {
        op.request.body.key = randomUUID();
      },
      (op: ProviderOperation) => {
        op.request.body.value = 47;
      },
      (op: ProviderOperation) => {
        op.request.path = "/single/../../refund";
      },
      (op: ProviderOperation) => {
        op.request.body.capture = {};
      },
      (op: ProviderOperation) => {
        op.request.method = "PATCH";
      },
    ];
    for (const change of changes) {
      const op = operation();
      change(op);
      expect(await new EasypayProvider().mutate(op)).toMatchObject({
        state: "unknown",
        error_class: "invalid_authorisation_request",
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not post hosted-card sale requests", async () => {
    const op = operation();
    op.request.path = "/checkout";
    op.request.body = {
      type: ["single"],
      payment: {
        type: "sale",
        methods: ["CC"],
        currency: "EUR",
        key: op.attempt_id,
      },
      order: { key: op.attempt_id, value: 46 },
    };
    expect((await new EasypayProvider().mutate(op)).error_class).toBe(
      "invalid_authorisation_request",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not recover a different payment behind a foreign hosted checkout", async () => {
    for (const foreign of ["checkout", "payment_key"]) {
      const op = operation(),
        checkout = randomUUID();
      op.request.path = "/checkout";
      op.request.body = {
        type: ["single"],
        payment: {
          type: "authorisation",
          methods: ["CC"],
          currency: "EUR",
          key: op.attempt_id,
        },
        order: { key: op.attempt_id, value: 46 },
      };
      op.checkout_manifest = {
        id: checkout,
        session: "private-synthetic-session",
      };
      fetcher.mockResolvedValueOnce(
        json({
          checkout: {
            id: foreign === "checkout" ? randomUUID() : checkout,
            status: "complete",
          },
          payment: {
            id: randomUUID(),
            key: foreign === "payment_key" ? randomUUID() : op.attempt_id,
          },
        }),
      );
      expect(await new EasypayProvider().reconcile(op)).toMatchObject({
        state: "unknown",
        error_class: "checkout_identity_conflict",
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("resolves a notification's authorisation resource separately from its persisted Single token", async () => {
    const op = operation(),
      auth = randomUUID(),
      payment = randomUUID();
    fetcher
      .mockResolvedValueOnce(
        json({
          id: auth,
          key: op.attempt_id,
          currency: "EUR",
          method: { type: "MBW" },
          value: 46,
          status: "success",
          value_captured: 0,
        }),
      )
      .mockResolvedValueOnce(json(singleFact(op, payment)));
    expect(
      await new EasypayProvider().reconcile(
        { ...op, provider_resource_id: payment },
        auth,
      ),
    ).toMatchObject({ state: "succeeded", resource_id: payment });
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
      `https://api.test.easypay.pt/2.0/authorisation/${auth}`,
      `https://api.test.easypay.pt/2.0/single/${payment}`,
    ]);
  });
  it("recovers the Single token by the original key when only the authorisation notification is known", async () => {
    const op = operation(),
      auth = randomUUID(),
      payment = randomUUID();
    fetcher
      .mockResolvedValueOnce(
        json({
          id: auth,
          key: op.attempt_id,
          currency: "EUR",
          method: { type: "MBW" },
          value: 46,
          status: "success",
          value_captured: 0,
        }),
      )
      .mockResolvedValueOnce(json({ data: [singleFact(op, payment)] }));
    expect(await new EasypayProvider().reconcile(op, auth)).toMatchObject({
      state: "succeeded",
      resource_id: payment,
    });
    expect(fetcher.mock.calls[1][0]).toContain(`/single?key=${op.attempt_id}`);
    expect(fetcher.mock.calls.every((c) => c[1].method === "GET")).toBe(true);
  });
  it("does not trust an authorisation callback from a different resource or amount", async () => {
    for (const patch of [
      { id: randomUUID() },
      { key: randomUUID() },
      { value: 47 },
      { currency: "USD" },
      { method: { type: "CC" } },
    ]) {
      const op = operation(),
        auth = randomUUID();
      fetcher.mockResolvedValueOnce(
        json({
          id: auth,
          key: op.attempt_id,
          currency: "EUR",
          method: { type: "MBW" },
          value: 46,
          ...patch,
        }),
      );
      expect(
        (await new EasypayProvider().reconcile(op, auth)).error_class,
      ).toBe("authorisation_identity_conflict");
    }
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("checks the Single ID as well as key, currency and amount", async () => {
    const op = operation(),
      expected = randomUUID();
    fetcher.mockResolvedValueOnce(json(singleFact(op, randomUUID())));
    expect(
      (
        await new EasypayProvider().reconcile({
          ...op,
          provider_resource_id: expected,
        })
      ).error_class,
    ).toBe("payment_identity_conflict");
  });
  it("preserves confirmed authorisation history after capture, void or expiry without restoring capture eligibility", async () => {
    const op = operation(),
      payment = randomUUID(),
      auth = randomUUID(),
      provider = new EasypayProvider();
    for (const patch of [
      {
        payment_status: "paid",
        captures: [{ id: randomUUID(), status: "success" }],
      },
      { payment_status: "voided" },
      { payment_status: "failed" },
    ]) {
      fetcher
        .mockResolvedValueOnce(
          json({
            id: auth,
            key: op.attempt_id,
            currency: "EUR",
            method: { type: "MBW" },
            value: 46,
            status: "success",
            value_captured: patch.payment_status === "paid" ? 46 : 0,
          }),
        )
        .mockResolvedValueOnce(json(singleFact(op, payment, patch)));
      expect(
        await provider.reconcile(
          { ...op, status: "succeeded", provider_resource_id: payment },
          auth,
        ),
      ).toMatchObject({
        state: "succeeded",
        resource_id: payment,
        amount: 4600,
      });
      fetcher.mockResolvedValueOnce(json(singleFact(op, payment, patch)));
      expect(
        await provider.authorisationValid(payment, op.attempt_id!, 4600, "MBW"),
      ).toBe(false);
    }
    expect(fetcher.mock.calls.every((c) => c[1].method === "GET")).toBe(true);
  });
  it("holds a newly observed authorisation when its resource contradicts the Single state", async () => {
    const op = operation(),
      payment = randomUUID(),
      auth = randomUUID();
    for (const patch of [
      { status: "pending", value_captured: 0 },
      { status: "failed", value_captured: 0 },
      { status: "success", value_captured: 1 },
      { status: "success", value_captured: "unreadable" },
    ]) {
      fetcher
        .mockResolvedValueOnce(
          json({
            id: auth,
            key: op.attempt_id,
            currency: "EUR",
            method: { type: "MBW" },
            value: 46,
            ...patch,
          }),
        )
        .mockResolvedValueOnce(json(singleFact(op, payment)));
      expect(
        await new EasypayProvider().reconcile(
          { ...op, provider_resource_id: payment },
          auth,
        ),
      ).toMatchObject({
        state: "unknown",
        error_class: "authorisation_state_conflict",
      });
    }
  });
  it("does not mistake an unrecorded paid Single for a new authorisation", async () => {
    const op = operation(),
      payment = randomUUID();
    fetcher.mockResolvedValueOnce(
      json(singleFact(op, payment, { payment_status: "paid" })),
    );
    expect(
      await new EasypayProvider().reconcile({
        ...op,
        provider_resource_id: payment,
      }),
    ).toMatchObject({
      state: "unknown",
      error_class: "unexpected_capture",
    });
  });
  it("prevents capture while an earlier capture is delayed, pending, successful or uncertain", async () => {
    const op = operation(),
      payment = randomUUID(),
      provider = new EasypayProvider();
    for (const status of [
      "delayed",
      "pending",
      "waiting",
      "success",
      "refunded",
      "unknown",
      undefined,
    ]) {
      fetcher.mockResolvedValueOnce(
        json(
          singleFact(op, payment, { captures: [{ id: randomUUID(), status }] }),
        ),
      );
      expect(
        await provider.authorisationValid(payment, op.attempt_id!, 4600, "MBW"),
      ).toBe(false);
    }
    fetcher.mockResolvedValueOnce(
      json(
        singleFact(op, payment, {
          captures: [{ id: randomUUID(), status: "failed" }],
        }),
      ),
    );
    expect(
      await provider.authorisationValid(payment, op.attempt_id!, 4600, "MBW"),
    ).toBe(true);
    fetcher.mockResolvedValueOnce(
      json(singleFact(op, payment, { method: { type: "CC" } })),
    );
    expect(
      await provider.authorisationValid(payment, op.attempt_id!, 4600, "MBW"),
    ).toBe(false);
  });
  it("requires a complete balanced two-beneficiary allocation before capture POST", async () => {
    for (const splits of [
      [],
      [{ split_key: "ruvon", account: { id: randomUUID() }, value: 46 }],
      [
        { split_key: "ruvon", account: { id: randomUUID() }, value: 36 },
        { split_key: "ruvon", account: { id: randomUUID() }, value: 10 },
      ],
      [
        { split_key: "merchant", account: { id: randomUUID() }, value: 36 },
        { split_key: "ruvon", account: { id: randomUUID() }, value: 11 },
      ],
    ]) {
      const op = captureOperation();
      op.request.body.splits = splits;
      expect((await new EasypayProvider().mutate(op)).error_class).toBe(
        "invalid_capture_allocation",
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not accept missing, duplicate, changed or foreign provider splits as a successful capture", async () => {
    const changes = [
      (f: ReturnType<typeof captureFact>) => {
        f.splits.pop();
      },
      (f: ReturnType<typeof captureFact>) => {
        f.splits[1].split_key = f.splits[0].split_key;
      },
      (f: ReturnType<typeof captureFact>) => {
        f.splits[1].id = f.splits[0].id;
      },
      (f: ReturnType<typeof captureFact>) => {
        f.splits[1].value += 1;
      },
      (f: ReturnType<typeof captureFact>) => {
        f.splits[1].account = { id: randomUUID() };
      },
    ];
    for (const change of changes) {
      const op = captureOperation(),
        resource = randomUUID(),
        fact = captureFact(op, resource);
      change(fact);
      fetcher.mockResolvedValueOnce(json(fact));
      expect(
        await new EasypayProvider().reconcile({
          ...op,
          provider_resource_id: resource,
        }),
      ).toMatchObject({
        state: "unknown",
        resource_id: resource,
        error_class: "split_identity_conflict",
      });
    }
  });
  it("recovers a lost capture response using the existing parent/key and never posts it again", async () => {
    const op = captureOperation(),
      resource = randomUUID();
    fetcher.mockRejectedValueOnce(new Error("lost response"));
    const provider = new EasypayProvider();
    expect((await provider.mutate(op)).state).toBe("unknown");
    fetcher
      .mockResolvedValueOnce(
        json(
          singleFact(op, op.request.parent_id as string, {
            payment_status: "paid",
            captures: [
              {
                id: resource,
                transaction_key: op.idempotency_key,
                status: "success",
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(json(captureFact(op, resource)));
    expect(await provider.reconcile(op)).toMatchObject({
      state: "succeeded",
      resource_id: resource,
      amount: 4600,
    });
    expect(
      fetcher.mock.calls.filter((c) => c[1].method === "POST"),
    ).toHaveLength(1);
  });
  it("retains uncertainty for a mismatched refund value, even when pending", async () => {
    const op = operation("refund"),
      parent = randomUUID(),
      resource = randomUUID();
    op.request = {
      path: `/refund/${parent}`,
      method: "POST",
      parent_id: parent,
      body: { transaction_key: op.idempotency_key, value: 10 },
    };
    fetcher.mockResolvedValueOnce(
      json({
        id: resource,
        transaction_key: op.idempotency_key,
        value: 9,
        status: "pending",
        capture: { id: parent },
      }),
    );
    expect(
      await new EasypayProvider().reconcile({
        ...op,
        provider_resource_id: resource,
      }),
    ).toMatchObject({
      state: "unknown",
      resource_id: resource,
      error_class: "operation_amount_conflict",
    });
  });
  it("checks a void's authorisation identity against the frozen Single without assuming equal resource IDs", async () => {
    for (const patch of [
      { key: randomUUID() },
      { value: 45 },
      { method: { type: "CC" } },
    ]) {
      const op = operation("void"),
        parent = randomUUID(),
        resource = randomUUID();
      op.request = {
        path: `/void/${parent}`,
        method: "POST",
        parent_id: parent,
        body: { transaction_key: op.idempotency_key },
      };
      fetcher
        .mockResolvedValueOnce(
          json({
            id: resource,
            transaction_key: op.idempotency_key,
            status: "success",
            authorisation: {
              id: randomUUID(),
              key: op.attempt_id,
              method: { type: "MBW" },
              currency: "EUR",
              value: 46,
              ...patch,
            },
          }),
        )
        .mockResolvedValueOnce(
          json(singleFact(op, parent, { payment_status: "voided" })),
        );
      expect(
        await new EasypayProvider().reconcile({
          ...op,
          provider_resource_id: resource,
        }),
      ).toMatchObject({
        state: "unknown",
        error_class: "void_parent_conflict",
      });
    }
  });
  it("does not confirm a void while the provider reports captured or uncertain funds", async () => {
    for (const patch of [
      { payment_status: "paid" },
      { captures: [{ id: randomUUID(), status: "pending" }] },
    ]) {
      const op = operation("void"),
        parent = randomUUID(),
        resource = randomUUID();
      op.request = {
        path: `/void/${parent}`,
        method: "POST",
        parent_id: parent,
        body: { transaction_key: op.idempotency_key },
      };
      fetcher
        .mockResolvedValueOnce(
          json({
            id: resource,
            transaction_key: op.idempotency_key,
            status: "success",
            authorisation: {
              id: randomUUID(),
              key: op.attempt_id,
              method: { type: "MBW" },
              currency: "EUR",
              value: 46,
            },
          }),
        )
        .mockResolvedValueOnce(json(singleFact(op, parent, patch)));
      expect(
        await new EasypayProvider().reconcile({
          ...op,
          provider_resource_id: resource,
        }),
      ).toMatchObject({ state: "unknown", error_class: "void_state_conflict" });
    }
  });
  it("rejects capture relationships to a different payment family", async () => {
    const op = captureOperation(),
      resource = randomUUID();
    fetcher.mockResolvedValueOnce(
      json({ ...captureFact(op, resource), payment_type: "frequent" }),
    );
    expect(
      await new EasypayProvider().reconcile({
        ...op,
        provider_resource_id: resource,
      }),
    ).toMatchObject({
      state: "unknown",
      error_class: "capture_parent_conflict",
    });
  });
});
