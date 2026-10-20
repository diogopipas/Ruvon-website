import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
const deadlines = new AsyncLocalStorage<number>();
export function withProviderDeadline<T>(
  deadline: number,
  task: () => Promise<T>,
) {
  return deadlines.run(deadline, task);
}
export class ProviderError extends Error {
  constructor(
    public classification: string,
    public definitive = false,
    public retryAfter?: number,
  ) {
    super(classification);
  }
}
/** Reserve time for persisting intent and the subsequent provider request. */
export function requireProviderBudget(minimumMs: number) {
  const deadline = deadlines.getStore();
  if (deadline !== undefined && deadline - Date.now() < minimumMs)
    throw new ProviderError("worker_budget_expired");
}
export async function providerJson(url: string, init: RequestInit) {
  let response: Response;
  const deadline = deadlines.getStore();
  const remaining =
    deadline === undefined ? 6000 : Math.min(6000, deadline - Date.now());
  if (remaining <= 0) throw new ProviderError("worker_budget_expired");
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(Math.ceil(remaining)),
    });
  } catch {
    throw new ProviderError("transport_unknown");
  }
  if (!response.ok) {
    const raw = response.headers.get("retry-after");
    const seconds = raw
      ? /^\d+$/.test(raw)
        ? Number(raw)
        : Math.max(0, (Date.parse(raw) - Date.now()) / 1000)
      : undefined;
    throw new ProviderError(
      `http_${response.status}`,
      init.method !== "GET" &&
        [400, 401, 403, 404, 412, 422].includes(response.status),
      seconds,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError("invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 256000) {
      await reader.cancel();
      throw new ProviderError("oversized_response");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new ProviderError("invalid_response");
  }
}
