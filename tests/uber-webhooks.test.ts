import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Job } from "@/lib/server/payments/service";
const { rpc, from, read } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  read: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/orders/repository", () => ({
  orderRepository: () => ({ rpc, db: { from } }),
}));
vi.mock("@/lib/server/delivery/uber-direct", () => ({
  UberDirectProvider: class {
    read = read;
  },
}));
import { ingestUber, processInbox } from "@/lib/server/webhooks/inbox";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RUVON_PAYMENTS_MODE", "sandbox");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("RUVON_DELIVERY_MODE", "sandbox");
  vi.stubEnv("UBER_DIRECT_CLIENT_ID", "test-client");
  vi.stubEnv("UBER_DIRECT_SECRET", "test-secret");
  vi.stubEnv("UBER_DIRECT_CUSTOMER_ID", "test-customer");
  vi.stubEnv("UBER_WEBHOOK_SIGNING_KEY", "test-signing-key");
  rpc.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
function event() {
  return {
    id: "evt_test",
    kind: "event.delivery_status",
    customer_id: "test-customer",
    live_mode: false,
    delivery_id: "del_test",
    status: "pickup",
    created: new Date().toISOString(),
    data: {
      id: "del_test",
      external_id: randomUUID(),
      status: "pickup",
      related_deliveries: null,
    },
  };
}
function request(payload: unknown, valid = true) {
  const body = JSON.stringify(payload);
  return new Request("https://sandbox.example.com/api/webhooks/uber-direct", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "x-uber-signature": valid
        ? createHmac("sha256", "test-signing-key").update(body).digest("hex")
        : "0".repeat(64),
    },
  });
}
it("persists useful signed status evidence without contact, document, image or courier data", async () => {
  const p = event();
  await ingestUber(
    request({
      ...p,
      courier_imminent: true,
      phone_number: "discard",
      data: {
        ...p.data,
        dropoff: {
          address: "discard",
          verification: { identification: { document_number: "discard" } },
        },
        courier: { name: "discard", phone_number: "discard" },
      },
    }),
  );
  expect(rpc).toHaveBeenCalledExactlyOnceWith("commerce_ingest_event", {
    p_data: expect.objectContaining({
      provider: "uber",
      account: "test-customer",
      environment: "sandbox",
      resource_id: "del_test",
      payload: { ...p, courier_imminent: true },
    }),
  });
  expect(JSON.stringify(rpc.mock.calls)).not.toContain("discard");
});
it("rejects a forged signature before persisting or reading a provider resource", async () => {
  await expect(ingestUber(request(event(), false))).rejects.toMatchObject({
    status: 401,
  });
  expect(rpc).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
it("accepts Uber's documented Postmates signature header over the exact raw body", async () => {
  const r = request(event());
  r.headers.set("x-postmates-signature", r.headers.get("x-uber-signature")!);
  r.headers.delete("x-uber-signature");
  await ingestUber(r);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("does not bypass an invalid primary signature using a different secondary header", async () => {
  const r = request(event());
  r.headers.set("x-postmates-signature", r.headers.get("x-uber-signature")!);
  r.headers.set("x-uber-signature", "0".repeat(64));
  await expect(ingestUber(r)).rejects.toMatchObject({ status: 401 });
  expect(rpc).not.toHaveBeenCalled();
});
it.each([{ customer_id: "foreign" }, { live_mode: true }])(
  "rejects a correctly signed callback with a foreign account/environment: %j",
  async (patch) => {
    await expect(
      ingestUber(request({ ...event(), ...patch })),
    ).rejects.toMatchObject({ status: 403 });
    expect(rpc).not.toHaveBeenCalled();
  },
);
function builder(data: unknown) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data, error: null }),
    single: async () => ({ data, error: null }),
  };
  return q;
}
function setupReturn(known: boolean) {
  const external = randomUUID();
  const e = {
    id: randomUUID(),
    provider: "uber",
    account: "test-customer",
    environment: "sandbox",
    state: "pending",
    resource_id: "ret_test",
  };
  from.mockImplementation((table) =>
    builder(
      table === "external_events"
        ? e
        : table === "provider_operations" && known
          ? { id: randomUUID() }
          : null,
    ),
  );
  read
    .mockResolvedValueOnce({
      id: "ret_test",
      status: "delivered",
      related_deliveries: [{ id: "del_original", relationship: "original" }],
    })
    .mockResolvedValueOnce({
      id: "del_original",
      status: "returned",
      external_id: external,
    });
  const j: Job = {
    id: randomUUID(),
    kind: "external_event",
    order_id: null,
    reference_id: e.id,
    payload: {},
    attempts: 1,
    lease_token: randomUUID(),
    lease_expires_at: new Date(Date.now() + 90000).toISOString(),
    created_at: new Date().toISOString(),
  };
  return { e, j };
}
it("quarantines a provider-only return without inventing an order or retrying forever", async () => {
  const { e, j } = setupReturn(false);
  await processInbox(j);
  expect(read.mock.calls.map((c) => c[0])).toEqual([
    "ret_test",
    "del_original",
  ]);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("commerce_process_inbox", {
    p_event: e.id,
    p_job: j.id,
    p_token: j.lease_token,
    p_order: null,
    p_error: "UNMATCHED_RETURN",
    p_bind_only: false,
  });
});
it("keeps a known return pending while its original booking is still being recovered", async () => {
  const { j } = setupReturn(true);
  await expect(processInbox(j)).rejects.toThrow("pending");
  expect(rpc).not.toHaveBeenCalled();
});
