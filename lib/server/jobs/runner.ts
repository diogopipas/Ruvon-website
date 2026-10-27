import "server-only";
import { orderRepository } from "../orders/repository";
import { handleJob } from "./handlers";
import type { Job } from "../payments/service";
import { ProviderError } from "../payments/http";
import { withProviderDeadline } from "../payments/http";
import { pingWorkerHeartbeat } from "./heartbeat";
export function retryDelay(
  attempt: number,
  retryAfter = 0,
  random = Math.random,
) {
  return Math.max(
    retryAfter * 1000,
    [5000, 30000, 120000, 300000, 900000][
      Math.min(Math.max(attempt - 1, 0), 4)
    ] *
      (0.8 + random() * 0.4),
  );
}
export async function runJobs(source: "scheduled" | "immediate" = "scheduled") {
  const repo = orderRepository();
  const started = Date.now();
  let processed = 0;
  if (source === "scheduled")
    await repo.rpc("commerce_worker_health", { p_success: false });
  await repo.rpc("commerce_sweep");
  async function consume(jobs: Job[], next: () => Job | undefined) {
    while (jobs.length && Date.now() - started < 14000) {
      const job = next();
      if (!job) break;
      try {
        await withProviderDeadline(started + 20000, () => handleJob(job));
        if (
          await repo.rpc<boolean>("commerce_finish_job", {
            p_id: job.id,
            p_token: job.lease_token,
          })
        )
          processed++;
      } catch (error) {
        const classification =
          error instanceof ProviderError
            ? error.classification
            : error instanceof Error && error.message === "pending"
              ? "pending"
              : "job_retry";
        const exhausted = job.attempts >= 12 && classification !== "pending";
        // A failed operator alert must not recursively create another alert case.
        if (exhausted && job.order_id && job.kind !== "operator_alert")
          await repo.rpc("commerce_open_case", {
            p_order: job.order_id,
            p_key: `job-failed:${job.id}`,
            p_type: "automation",
            p_reason: "AUTOMATION_EXHAUSTED",
          });
        await repo.rpc("commerce_finish_job", {
          p_id: job.id,
          p_token: job.lease_token,
          p_error: classification,
          p_retry_at: exhausted
            ? null
            : new Date(
                Date.now() +
                  retryDelay(
                    job.attempts,
                    error instanceof ProviderError ? error.retryAfter : 0,
                  ),
              ).toISOString(),
        });
        console.error(
          "[Ruvon] job",
          JSON.stringify({
            job_id: job.id,
            order_id: job.order_id,
            kind: job.kind,
            error_class: classification,
          }),
        );
      }
    }
  }
  // Drain newly committed work within the same budget, so a confirmed capture
  // can book immediately without waiting for the next Cron invocation.
  let claimed = 0;
  while (claimed < 10 && Date.now() - started < 14000) {
    const jobs = await repo.rpc<Job[]>("commerce_claim_jobs", {
      p_limit: 10 - claimed,
    });
    if (!jobs.length) break;
    claimed += jobs.length;
    let cursor = 0;
    const next = () => jobs[cursor++];
    await Promise.all([consume(jobs, next), consume(jobs, next)]);
  }
  // Only the scheduled invocation proves scheduler health. Webhook bursts must
  // neither flood the external monitor nor hide a broken Cron schedule.
  if (source === "scheduled") {
    // Leave margin inside pg_net's 25-second timeout for the DB acknowledgement.
    await pingWorkerHeartbeat(started + 23000);
    await repo.rpc("commerce_worker_health", {
      p_success: true,
      p_jobs: processed,
    });
  }
  return { processed };
}
