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
import { pingWorkerHeartbeat } from "@/lib/server/jobs/heartbeat";

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
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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

it("retries a timed-out monitoring ping without repeating committed order work", async () => {
  vi.stubEnv(
    "CHECKLY_HEARTBEAT_URL",
    "https://ping.checklyhq.com/private-test-token",
  );
  const current = job("confirm_order");
  let claimed = false;
  rpc.mockImplementation(async (name) =>
    name === "commerce_claim_jobs"
      ? claimed
        ? []
        : ((claimed = true), [current])
      : true,
  );
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(
      new DOMException("private URL omitted", "TimeoutError"),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  expect(await runJobs()).toEqual({ processed: 1 });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(handleJob).toHaveBeenCalledTimes(1);
  expect(
    rpc.mock.calls.filter(([name]) => name === "commerce_finish_job"),
  ).toHaveLength(1);
  expect(rpc).toHaveBeenLastCalledWith("commerce_worker_health", {
    p_success: true,
    p_jobs: 1,
  });
});

function delayedHeartbeat(milliseconds: number) {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      milliseconds,
    );
    return controller.signal;
  });
  const fetch = vi.fn(
    (_url: URL, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(init.signal!.reason);
        };
        const timer = setTimeout(() => {
          init.signal!.removeEventListener("abort", abort);
          resolve(new Response(null, { status: 204 }));
        }, milliseconds);
        init.signal!.addEventListener("abort", abort, { once: true });
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("accepts a real-world 2.5-second heartbeat inside the worker budget", async () => {
  vi.stubEnv(
    "CHECKLY_HEARTBEAT_URL",
    "https://ping.checklyhq.com/private-test-token",
  );
  const fetch = delayedHeartbeat(2500);
  const outcome = pingWorkerHeartbeat(Date.now() + 23000).then(
    () => true,
    () => false,
  );
  await vi.advanceTimersByTimeAsync(10000);
  expect(await outcome).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not extend monitoring past the remaining invocation budget", async () => {
  vi.stubEnv(
    "CHECKLY_HEARTBEAT_URL",
    "https://ping.checklyhq.com/private-test-token",
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetch = delayedHeartbeat(800);
  const outcome = pingWorkerHeartbeat(Date.now() + 500).catch(
    (error) => error.message,
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(await outcome).toBe("monitor_heartbeat_budget_expired");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not retry denied monitoring access or log its private URL", async () => {
  const secret = "https://ping.checklyhq.com/private-test-token";
  vi.stubEnv("CHECKLY_HEARTBEAT_URL", secret);
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(pingWorkerHeartbeat(Date.now() + 23000)).rejects.toThrow(
    "monitor_heartbeat_http_403",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
});

it("does not ping before database work is successful", async () => {
  vi.stubEnv(
    "CHECKLY_HEARTBEAT_URL",
    "https://ping.checklyhq.com/private-test-token",
  );
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  rpc.mockRejectedValue(new Error("Database unavailable"));
  await expect(runJobs()).rejects.toThrow("Database unavailable");
  expect(fetch).not.toHaveBeenCalled();
});
it("processes immediate webhook work without pinging or masking scheduled-worker health", async () => {
  vi.stubEnv(
    "CHECKLY_HEARTBEAT_URL",
    "https://ping.checklyhq.com/private-test-token",
  );
  const fetch = vi
    .fn()
    .mockRejectedValue(new Error("must_not_ping_for_each_callback"));
  vi.stubGlobal("fetch", fetch);
  const current = job("external_event");
  let claimed = false;
  rpc.mockImplementation(async (name) =>
    name === "commerce_claim_jobs"
      ? claimed
        ? []
        : ((claimed = true), [current])
      : true,
  );
  expect(await runJobs("immediate")).toEqual({ processed: 1 });
  expect(handleJob).toHaveBeenCalledExactlyOnceWith(current);
  expect(rpc).toHaveBeenCalledWith("commerce_finish_job", {
    p_id: current.id,
    p_token: current.lease_token,
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(
    rpc.mock.calls.some(([name]) => name === "commerce_worker_health"),
  ).toBe(false);
});
it("continues scheduled heartbeat reporting even when the queue is empty", async () => {
  vi.stubEnv(
    "CHECKLY_HEARTBEAT_URL",
    "https://ping.checklyhq.com/private-test-token",
  );
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  rpc.mockImplementation(async (name) =>
    name === "commerce_claim_jobs" ? [] : true,
  );
  expect(await runJobs()).toEqual({ processed: 0 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenLastCalledWith("commerce_worker_health", {
    p_success: true,
    p_jobs: 0,
  });
});

it("does not acknowledge worker health when both monitoring attempts fail", async () => {
  vi.stubEnv(
    "CHECKLY_HEARTBEAT_URL",
    "https://ping.checklyhq.com/private-test-token",
  );
  rpc.mockImplementation(async (name) =>
    name === "commerce_claim_jobs" ? [] : true,
  );
  const fetch = vi
    .fn()
    .mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(runJobs()).rejects.toThrow("monitor_heartbeat_timeout");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(rpc).not.toHaveBeenCalledWith(
    "commerce_worker_health",
    expect.objectContaining({ p_success: true }),
  );
});

it("rejects a monitoring destination outside the provider allowlist", async () => {
  vi.stubEnv("CHECKLY_HEARTBEAT_URL", "https://example.com/private");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(pingWorkerHeartbeat(Date.now() + 23000)).rejects.toThrow(
    "monitor_heartbeat_invalid_configuration",
  );
  expect(fetch).not.toHaveBeenCalled();
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

it("does not recursively create cases when an operator notification fails", async () => {
  const alert = { ...job("operator_alert"), attempts: 12 };
  let pending = true;
  rpc.mockImplementation(async (name: string) => {
    if (name === "commerce_claim_jobs") {
      const jobs = pending ? [alert] : [];
      pending = false;
      return jobs;
    }
    return true;
  });
  handleJob.mockRejectedValue(new Error("provider unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await runJobs();
    expect(rpc.mock.calls.some(([name]) => name === "commerce_open_case")).toBe(
      false,
    );
    expect(rpc).toHaveBeenCalledWith(
      "commerce_finish_job",
      expect.objectContaining({ p_id: alert.id, p_retry_at: null }),
    );
  } finally {
    log.mockRestore();
  }
});
