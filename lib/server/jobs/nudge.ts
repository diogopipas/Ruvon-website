import "server-only";
import { after } from "next/server";
import { runJobs } from "./runner";
/** Latency optimisation only. PostgreSQL + Cron own eventual execution. */
export function nudgeJobs() {
  after(async () => {
    try {
      await runJobs("immediate");
    } catch {
      console.error("[Ruvon] worker immediate_attempt_failed");
    }
  });
}
