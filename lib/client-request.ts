"use client";

/** One running write and one replaceable pending snapshot, rather than an
 * unbounded promise chain when a connection is slow. All callers share the
 * flush result; failure stops the flush and a later call can retry. */
export function createLatestWriter<T>(write: (value: T) => Promise<void>) {
  let pending: { value: T } | null = null;
  let running: Promise<void> | null = null;
  return (value: T): Promise<void> => {
    pending = { value };
    if (running) return running;
    running = Promise.resolve().then(async () => {
      try {
        while (pending) {
          const next = pending;
          pending = null;
          await write(next.value);
        }
      } catch (error) {
        pending = null;
        throw error;
      } finally {
        running = null;
      }
    });
    return running;
  };
}

/** Keep stalled connections from trapping a form or the cart write queue. */
export async function postJson<T = unknown>(
  path: string,
  payload: unknown,
): Promise<T> {
  if (!path.startsWith("/api/") || path.includes("://"))
    throw new Error("Destino do pedido inválido.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      keepalive: true,
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        result && typeof result === "object" && "error" in result
          ? result.error
          : null;
      throw new Error(
        typeof message === "string"
          ? message
          : "Não conseguimos guardar agora. Tenta novamente.",
      );
    }
    if (result === null)
      throw new Error("Não conseguimos confirmar o pedido. Tenta novamente.");
    return result as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("A ligação demorou demasiado. Tenta novamente.");
    if (error instanceof TypeError)
      throw new Error(
        "Sem ligação. Os teus dados continuam aqui. Tenta novamente.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
