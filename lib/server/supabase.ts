import "server-only";
import { createClient } from "@supabase/supabase-js";
export const STORAGE_TIMEOUT_MS = 8000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = STORAGE_TIMEOUT_MS,
) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;
  // The signal remains active while Supabase reads the response body too.
  return fetch(input, { ...init, signal });
}

export function getSupabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url && !key) return null;
  if (!url || !key) throw new Error("Supabase configuration is incomplete.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetchWithTimeout(input, init) },
  });
}
export function isLocalStorage() {
  return (
    !process.env.VERCEL &&
    process.env.JOLA_LOCAL_DEMO === "true" &&
    !process.env.SUPABASE_URL?.trim() &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}
