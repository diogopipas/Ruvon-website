import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Job } from "@/lib/server/payments/service";

const { rpc, handleJob } = vi.hoisted(() => ({
  rpc: vi.fn(),
  handleJob: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/orders/repository", () => ({
  orderRepository: () => ({ rpc }),
}));
vi.mock("@/lib/server/jobs/handlers", () => ({ handleJob }));
import { runJobs, retryDelay } from "@/lib/server/jobs/runner";

function job(kind: string): Job {
  return {
    id: randomUUID(),
    kind,
    order_id: randomUUID(),
    reference_id: null,
    payload: {},
    attempts: 1,
    lease_token: randomUUID(),
    lease_expires_at: new Date(Date.now() + 90000).toISOString(),
    created_at: new Date().toISOString(),
  };
}
beforeEach(() => {
  rpc.mockReset();
  handleJob.mockReset();
  vi.stubEnv("CHECKLY_HEARTBEAT_URL", "");
});
afterEach(() => vi.unstubAllEnvs());

it("runs delivery work committed by capture within the same invocation", async () => {
  const queue = [job("confirm_order")];
  rpc.mockImplementation(async (name: string) => {
    if (name === "commerce_claim_jobs") return queue.splice(0);
    return true;
  });
  handleJob.mockImplementation(async (current: Job) => {
    if (current.kind === "confirm_order") queue.push(job("book_delivery"));
  });
  expect(await runJobs()).toEqual({ processed: 2 });
  expect(handleJob.mock.calls.map(([j]) => j.kind)).toEqual([
    "confirm_order",
    "book_delivery",
  ]);
  expect(
    rpc.mock.calls.filter(([name]) => name === "commerce_finish_job"),
  ).toHaveLength(2);
});

it("bounds an invocation to ten jobs and two simultaneous handlers", async () => {
  const queue = Array.from({ length: 20 }, () => job("operation_reconcile"));
  let active = 0,
    peak = 0;
  rpc.mockImplementation(async (name: string, args?: { p_limit: number }) => {
    if (name === "commerce_claim_jobs") return queue.splice(0, args!.p_limit);
    return true;
  });
  handleJob.mockImplementation(async () => {
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
    active--;
  });
  expect(await runJobs()).toEqual({ processed: 10 });
  expect(queue).toHaveLength(10);
  expect(peak).toBe(2);
});

it("uses the provider retry delay when longer than bounded jitter", () => {
  expect(retryDelay(1, 60, () => 0)).toBe(60000);
  expect(retryDelay(3, 0, () => 0.5)).toBe(120000);
  expect(retryDelay(20, 0, () => 0)).toBe(720000);
});
