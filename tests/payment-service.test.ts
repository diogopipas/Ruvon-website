import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderOperation } from "@/lib/server/payments/provider";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/orders/repository", () => ({
  orderRepository: () => ({ rpc }),
}));
import { runOperation, type Job } from "@/lib/server/payments/service";
import { easypayCommerceConfig } from "@/lib/server/commerce-config";

const fetcher = vi.fn();
beforeEach(() => {
  vi.stubEnv("RUVON_PAYMENTS_MODE", "sandbox");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("EASYPAY_ACCOUNT_ID", randomUUID());
  vi.stubEnv("EASYPAY_API_KEY", "test-only");
  vi.stubEnv("EASYPAY_MARKETPLACE_ACCOUNT_ID", "");
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  rpc.mockReset();
  rpc.mockImplementation(
    async (name) => name === "commerce_dispatch_operation",
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function fixture() {
  const attempt = randomUUID(),
    parent = randomUUID(),
    key = randomUUID();
  const op: ProviderOperation = {
    id: randomUUID(),
    provider: "easypay",
    account: process.env.EASYPAY_ACCOUNT_ID!,
    environment: "sandbox",
    kind: "capture",
    order_id: randomUUID(),
    attempt_id: attempt,
    logical_key: `capture:${attempt}`,
    idempotency_key: key,
    request: {
      path: `/capture/${parent}`,
      method: "POST",
      parent_id: parent,
      body: {
        transaction_key: key,
        value: 46,
        splits: [
          { split_key: "merchant", account: { id: randomUUID() }, value: 36 },
          { split_key: "ruvon", account: { id: randomUUID() }, value: 10 },
        ],
      },
    },
    request_hash: "synthetic",
    provider_resource_id: null,
    status: "created",
    created_at: new Date().toISOString(),
    retry_safe_until: null,
  };
  const job: Job = {
    id: randomUUID(),
    kind: "confirm_order",
    order_id: op.order_id,
    reference_id: null,
    payload: {},
    attempts: 1,
    lease_token: randomUUID(),
    lease_expires_at: new Date(Date.now() + 90000).toISOString(),
    created_at: new Date().toISOString(),
  };
  return { op, job };
}
function capture(op: ProviderOperation, id: string) {
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
    status: "success",
    value: 46,
    splits: splits.map((s) => ({
      ...s,
      id: randomUUID(),
      clearing_date: "2026-11-07",
    })),
  };
}
function authorise(op: ProviderOperation) {
  op.kind = "authorise";
  op.idempotency_key = op.attempt_id!;
  op.request = {
    path: "/single",
    method: "POST",
    amount: 4600,
    body: {
      type: "authorisation",
      method: "MBW",
      currency: "EUR",
      value: 46,
      key: op.attempt_id,
    },
  };
}

describe("durable payment dispatch and reconciliation", () => {
  it("refuses foreign accounts/environments and immediate sale before consuming a dispatch grant", async () => {
    for (const patch of ["account", "environment", "sale"]) {
      const { op, job } = fixture();
      if (patch === "account") op.account = randomUUID();
      if (patch === "environment") op.environment = "live";
      if (patch === "sale") {
        authorise(op);
        op.request.body.type = "sale";
      }
      await expect(runOperation(job, op)).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("passes a contradictory capture to the fenced transactional command on replay without another mutation", async () => {
    const { op, job } = fixture(),
      id = randomUUID();
    const detail = capture(op, id);
    detail.splits[0].account = { id: randomUUID() };
    fetcher
      .mockResolvedValueOnce(Response.json({ id }))
      .mockResolvedValueOnce(Response.json(detail));
    expect(await runOperation(job, op)).toBe("unknown");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "commerce_dispatch_operation",
      "commerce_apply_operation",
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_operation: op.id,
      p_job: job.id,
      p_token: job.lease_token,
      p_fact: {
        state: "unknown",
        resource_id: id,
        error_class: "split_identity_conflict",
      },
    });
    rpc.mockResolvedValueOnce(false);
    fetcher.mockResolvedValueOnce(Response.json(detail));
    expect(
      await runOperation(job, {
        ...op,
        status: "unknown",
        provider_resource_id: id,
      }),
    ).toBe("unknown");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "commerce_dispatch_operation",
      "commerce_apply_operation",
      "commerce_dispatch_operation",
      "commerce_apply_operation",
    ]);
    expect(
      fetcher.mock.calls.filter((c) => c[1].method === "POST"),
    ).toHaveLength(1);
    expect(
      rpc.mock.calls.some((c) => c[0] === "commerce_prepare_operation"),
    ).toBe(false);
  });
  it("stops when fenced persistence rejects a worker's expired lease", async () => {
    const { op, job } = fixture(),
      id = randomUUID();
    fetcher
      .mockResolvedValueOnce(Response.json({ id }))
      .mockResolvedValueOnce(Response.json({ ...capture(op, id), value: 47 }));
    rpc.mockImplementation(async (name) => {
      if (name === "commerce_apply_operation") throw new Error("lease_lost");
      return true;
    });
    await expect(runOperation(job, op)).rejects.toThrow("lease_lost");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "commerce_dispatch_operation",
      "commerce_apply_operation",
    ]);
    expect(
      fetcher.mock.calls.filter((c) => c[1].method === "POST"),
    ).toHaveLength(1);
  });
  it("keeps a lost mutation response unknown and uses reads on a denied redispatch", async () => {
    const { op, job } = fixture();
    fetcher.mockRejectedValueOnce(new Error("response_lost"));
    expect(await runOperation(job, op)).toBe("unknown");
    rpc.mockResolvedValueOnce(false);
    fetcher.mockResolvedValueOnce(
      Response.json({
        id: op.request.parent_id,
        key: op.attempt_id,
        type: "authorisation",
        currency: "EUR",
        method: { type: "MBW" },
        value: 46,
        payment_status: "authorised",
        captures: [],
      }),
    );
    expect(await runOperation(job, { ...op, status: "unknown" })).toBe(
      "unknown",
    );
    expect(
      fetcher.mock.calls.filter((c) => c[1].method === "POST"),
    ).toHaveLength(1);
    expect(rpc.mock.calls.some((c) => c[0] === "commerce_open_case")).toBe(
      false,
    );
  });
  it("can recover an existing capture without marketplace configuration while new commerce stays blocked", async () => {
    const { op, job } = fixture(),
      id = randomUUID();
    op.status = "pending";
    op.provider_resource_id = id;
    rpc.mockResolvedValueOnce(false);
    fetcher.mockResolvedValueOnce(Response.json(capture(op, id)));
    expect(() => easypayCommerceConfig()).toThrow(
      "Configuração operacional incompleta.",
    );
    expect(await runOperation(job, op)).toBe("succeeded");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
    expect(rpc.mock.calls.some((c) => c[0] === "commerce_open_case")).toBe(
      false,
    );
  });
  it("does not dispatch or raise a false conflict on a late authorisation read after capture", async () => {
    const { op, job } = fixture(),
      id = randomUUID();
    authorise(op);
    op.status = "succeeded";
    op.provider_resource_id = id;
    fetcher.mockResolvedValueOnce(
      Response.json({
        id,
        key: op.attempt_id,
        type: "authorisation",
        method: { type: "MBW" },
        currency: "EUR",
        value: 46,
        payment_status: "paid",
        captures: [{ id: randomUUID(), status: "success" }],
      }),
    );
    expect(await runOperation(job, op)).toBe("succeeded");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "commerce_apply_operation",
    ]);
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
    expect(rpc.mock.calls[0][1].p_fact).toMatchObject({
      state: "succeeded",
      resource_id: id,
      amount: 4600,
    });
  });
});
