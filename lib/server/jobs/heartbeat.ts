import "server-only";

/** Monitoring runs after durable work. A ping retry must never re-run that work. */
export async function pingWorkerHeartbeat(deadline: number) {
  const configured = process.env.CHECKLY_HEARTBEAT_URL;
  if (!configured) return;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("monitor_heartbeat_invalid_configuration");
  }
  if (
    url.protocol !== "https:" ||
    !["ping.checklyhq.com", "api.checklyhq.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("monitor_heartbeat_invalid_configuration");
  let failure = "monitor_heartbeat_unavailable";
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = Math.min(5000, deadline - Date.now());
    if (remaining <= 0) {
      failure = "monitor_heartbeat_budget_expired";
      break;
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(Math.ceil(remaining)),
      });
      await response.body?.cancel();
      if (response.ok) return;
      failure = `monitor_heartbeat_http_${response.status}`;
      if (response.status < 500) break;
    } catch (error) {
      failure =
        error instanceof Error && error.name === "TimeoutError"
          ? "monitor_heartbeat_timeout"
          : "monitor_heartbeat_transport";
    }
  }
  // Never log the private ping URL or the underlying fetch error/stack.
  console.error(
    "[Ruvon] worker heartbeat",
    JSON.stringify({ error_class: failure }),
  );
  throw new Error(failure);
}
