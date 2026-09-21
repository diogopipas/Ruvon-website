import "server-only";
import { createClient } from "@supabase/supabase-js";
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function isLocalStorage() {
  return (
    !process.env.VERCEL &&
    process.env.JOLA_LOCAL_DEMO === "true" &&
    !getSupabase()
  );
}
