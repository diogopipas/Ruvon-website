import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Job } from "@/lib/server/payments/service";

const { order, list, rpc, read } = vi.hoisted(() => ({
  order: vi.fn(),
  list: vi.fn(),
  rpc: vi.fn(),
  read: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/orders/repository", () => ({
  orderRepository: () => ({ order, list, rpc }),
}));
vi.mock("@/lib/server/delivery/uber-direct", () => ({
  UberDirectProvider: class {
    read = read;
  },
}));
import { handleJob } from "@/lib/server/jobs/handlers";
import { deliveryFact } from "@/lib/server/delivery/facts";

it("retains an authoritative parent contradiction rather than overwriting it with a cached relationship", () => {
  expect(
    deliveryFact(
      {
        id: "ret_return",
        status: "dropoff",
        related_deliveries: [
          { id: "del_authoritative", relationship: "original" },
        ],
      },
      "del_cached",
    ).parent_id,
  ).toBe("del_authoritative");
});

function job(kind: string, payload: Job["payload"] = {}): Job {
  return {
    id: randomUUID(),
    kind,
    order_id: randomUUID(),
    reference_id: null,
    payload,
    attempts: 1,
    lease_token: randomUUID(),
    lease_expires_at: new Date(Date.now() + 90000).toISOString(),
    created_at: new Date().toISOString(),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  order.mockImplementation(async (id) => ({ id }));
  list.mockResolvedValue([
    { provider_delivery_id: "del_outbound", direction: "outbound" },
    { provider_delivery_id: "ret_return", direction: "return" },
  ]);
  read.mockImplementation(async (id) => ({ id, status: "pending" }));
  rpc.mockResolvedValue(null);
});

it.each(["courier_check", "delivery_overdue"])(
  "%s reads the existing outbound delivery before applying its fenced deadline",
  async (kind) => {
    const j = job(kind, { delivery_id: "ret_return" });
    await handleJob(j);
    expect(read).toHaveBeenCalledExactlyOnceWith("del_outbound");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "commerce_apply_delivery",
      "commerce_delivery_deadline",
    ]);
    expect(rpc).toHaveBeenLastCalledWith("commerce_delivery_deadline", {
      p_job: j.id,
      p_token: j.lease_token,
      p_delivery: "del_outbound",
      p_status: "pending",
    });
    expect(read.mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[0],
    );
  },
);
it("does not apply a no-courier policy when the authoritative read fails", async () => {
  read.mockRejectedValueOnce(new Error("provider_unavailable"));
  await expect(handleJob(job("courier_check"))).rejects.toThrow(
    "provider_unavailable",
  );
  expect(rpc).not.toHaveBeenCalled();
});
it("does not evaluate the policy when ingestion rejects a stale worker", async () => {
  rpc.mockRejectedValueOnce(new Error("Lease lost"));
  await expect(handleJob(job("delivery_overdue"))).rejects.toThrow(
    "Lease lost",
  );
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "commerce_apply_delivery",
  ]);
});
it("never interprets a return leg as an outbound assignment", async () => {
  list.mockResolvedValue([
    { provider_delivery_id: "ret_return", direction: "return" },
  ]);
  await handleJob(job("courier_check"));
  expect(read).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
it("continues a known return read using its verified parent relationship", async () => {
  const j = job("delivery_reconcile", {
    delivery_id: "ret_return",
    parent_id: "del_outbound",
  });
  await handleJob(j);
  expect(read).toHaveBeenCalledExactlyOnceWith("ret_return");
  expect(rpc).toHaveBeenCalledExactlyOnceWith("commerce_apply_delivery", {
    p_order: j.order_id,
    p_fact: expect.objectContaining({
      id: "ret_return",
      status: "pending",
      parent_id: "del_outbound",
    }),
    p_job: j.id,
    p_token: j.lease_token,
  });
});
