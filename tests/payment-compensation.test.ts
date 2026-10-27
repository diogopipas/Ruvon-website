import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Job } from "@/lib/server/payments/service";

const {
  order,
  list,
  rpc,
  currentAttempt,
  operationFor,
  prepareOperation,
  runOperation,
  query,
} = vi.hoisted(() => ({
  order: vi.fn(),
  list: vi.fn(),
  rpc: vi.fn(),
  currentAttempt: vi.fn(),
  operationFor: vi.fn(),
  prepareOperation: vi.fn(),
  runOperation: vi.fn(),
  query: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/orders/repository", () => ({
  orderRepository: () => ({
    order,
    list,
    rpc,
    db: { from: () => ({ select: () => ({ eq: () => ({ single: query }) }) }) },
  }),
}));
vi.mock("@/lib/server/payments/service", () => ({
  currentAttempt,
  operationFor,
  prepareOperation,
  runOperation,
}));
import { handleJob } from "@/lib/server/jobs/handlers";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RUVON_PAYMENTS_MODE", "sandbox");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("EASYPAY_ACCOUNT_ID", randomUUID());
  vi.stubEnv("EASYPAY_API_KEY", "test-only");
  vi.stubEnv("EASYPAY_MARKETPLACE_ACCOUNT_ID", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("unexpected_network_request");
    }),
  );
  operationFor.mockResolvedValue(null);
  list.mockResolvedValue([]);
  prepareOperation.mockResolvedValue({ id: randomUUID() });
  runOperation.mockResolvedValue("succeeded");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function fixture(kind: string) {
  const id = randomUUID(),
    attempt = randomUUID();
  const job: Job = {
    id: randomUUID(),
    kind,
    order_id: id,
    reference_id: randomUUID(),
    payload: {},
    attempts: 1,
    lease_token: randomUUID(),
    lease_expires_at: new Date(Date.now() + 90000).toISOString(),
    created_at: new Date().toISOString(),
  };
  const o = {
    id,
    current_attempt_id: attempt,
    operational_status: "cancelling",
    payment_status: "authorised",
  };
  const a = {
    id: attempt,
    authorisation_id: randomUUID(),
    capture_id: randomUUID(),
    method: "MBW",
  };
  order.mockResolvedValue(o);
  currentAttempt.mockResolvedValue(a);
  return { job, o, a };
}
it("can prepare a void for existing authorised funds without a Marketplace beneficiary reference", async () => {
  const { job, o, a } = fixture("cancel_order");
  rpc.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await handleJob(job);
  expect(prepareOperation).toHaveBeenCalledExactlyOnceWith(
    job,
    o,
    "void",
    `void:${a.id}`,
    {
      path: `/void/${a.authorisation_id}`,
      method: "POST",
      parent_id: a.authorisation_id,
      body: expect.any(Object),
    },
    process.env.EASYPAY_ACCOUNT_ID,
    a.id,
  );
  expect(runOperation).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "commerce_close_cancellation",
    "commerce_close_cancellation",
  ]);
});
it("can prepare an already reserved customer refund without a Marketplace beneficiary reference", async () => {
  const { job, o, a } = fixture("refund");
  query.mockResolvedValue({
    data: { id: job.reference_id, amount: 1000 },
    error: null,
  });
  await handleJob(job);
  expect(prepareOperation).toHaveBeenCalledExactlyOnceWith(
    job,
    o,
    "refund",
    `refund:${job.reference_id}`,
    {
      path: `/refund/${a.capture_id}`,
      method: "POST",
      parent_id: a.capture_id,
      refund_id: job.reference_id,
      body: { value: 10 },
    },
    process.env.EASYPAY_ACCOUNT_ID,
    a.id,
  );
  expect(runOperation).toHaveBeenCalledTimes(1);
});
it("continues to block a new authorisation when Marketplace configuration is missing", async () => {
  const { job, o } = fixture("authorise");
  o.operational_status = "awaiting_payment";
  await expect(handleJob(job)).rejects.toThrow(
    "Configuração operacional incompleta.",
  );
  expect(prepareOperation).not.toHaveBeenCalled();
  expect(runOperation).not.toHaveBeenCalled();
});
it("reuses an existing void operation after a restart", async () => {
  const { job } = fixture("cancel_order"),
    existing = { id: randomUUID(), kind: "void", status: "unknown" };
  rpc.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  operationFor.mockResolvedValue(existing);
  await handleJob(job);
  expect(prepareOperation).not.toHaveBeenCalled();
  expect(runOperation).toHaveBeenCalledExactlyOnceWith(job, existing);
});
