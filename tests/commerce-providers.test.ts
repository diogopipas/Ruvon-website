import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
vi.mock("server-only", () => ({}));
import { EasypayProvider } from "@/lib/server/payments/easypay";
import { UberDirectProvider } from "@/lib/server/delivery/uber-direct";
import { verifyUberSignature } from "@/lib/server/webhooks/inbox";
import { deliveryFact } from "@/lib/server/delivery/facts";
import type { ProviderOperation } from "@/lib/server/payments/provider";
import { confirmCommerceCart, parseCommerceCart } from "@/lib/commerce-cart";

const fetcher = vi.fn();
beforeEach(() => {
  vi.stubEnv("RUVON_PAYMENTS_MODE", "sandbox");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("EASYPAY_ACCOUNT_ID", randomUUID());
  vi.stubEnv("EASYPAY_API_KEY", "test-only");
  vi.stubEnv("EASYPAY_MARKETPLACE_ACCOUNT_ID", randomUUID());
  vi.stubEnv("RUVON_DELIVERY_MODE", "sandbox");
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
    account: randomUUID(),
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
describe("documented provider transport contracts (synthetic fixtures)", () => {
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
        json({ payment: { id: payment, key: op.attempt_id } }),
      )
      .mockResolvedValueOnce(
        json({
          id: payment,
          key: op.attempt_id,
          method: { type: "CC" },
          currency: "EUR",
          value: 46,
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
    fetcher.mockResolvedValueOnce(json({ id })).mockResolvedValueOnce(
      json({
        id,
        status: "success",
        transaction_key: op.idempotency_key,
        authorisation: { id: parent },
      }),
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
    const op = {
      ...operation("delivery_create"),
      provider: "uber" as const,
      request: {
        path: "/deliveries",
        method: "POST" as const,
        body: {
          quote_id: "dqt_test",
          external_id: "test",
          idempotency_key: randomUUID(),
        },
      },
    };
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
    const op = operation("delivery_create");
    op.request = {
      path: "/deliveries",
      method: "POST",
      body: { quote_id: "dqt_test" },
    };
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
