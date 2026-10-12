import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sandboxDatabaseConfig, sandboxRequested } from "./payment-config";
import { fetchWithTimeout } from "./supabase";
import { RequestError } from "./http";

export function commerceEnvironment(): "sandbox" | "live" {
  if (sandboxRequested()) return "sandbox";
  if (
    process.env.RUVON_PAYMENTS_MODE === "live" &&
    process.env.VERCEL_ENV === "production"
  )
    return "live";
  throw new RequestError("Pedidos indisponíveis.", 404);
}
export function commerceDatabase() {
  const environment = commerceEnvironment();
  const { url, key } =
    environment === "sandbox"
      ? sandboxDatabaseConfig()
      : {
          url: process.env.SUPABASE_URL,
          key: process.env.SUPABASE_SERVICE_ROLE_KEY,
        };
  if (!url || !key)
    throw new RequestError("Serviço temporariamente indisponível.", 503);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetchWithTimeout(input, init, 5000) },
  });
}
export function commerceExposed() {
  try {
    return (
      process.env.RUVON_LIVE_CHECKOUT_ENABLED === "true" &&
      !!commerceEnvironment()
    );
  } catch {
    return false;
  }
}
export function requireSecret(name: string, minimum = 1) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimum)
    throw new RequestError("Configuração operacional incompleta.", 503);
  return value;
}
export function easypayCommerceConfig() {
  return {
    environment: commerceEnvironment(),
    account: requireSecret("EASYPAY_ACCOUNT_ID"),
    key: requireSecret("EASYPAY_API_KEY"),
    base:
      commerceEnvironment() === "live"
        ? "https://api.prod.easypay.pt/2.0"
        : "https://api.test.easypay.pt/2.0",
    marketplaceAccount: requireSecret("EASYPAY_MARKETPLACE_ACCOUNT_ID"),
  };
}
export function uberConfig() {
  const environment = commerceEnvironment();
  if (process.env.RUVON_DELIVERY_MODE !== environment)
    throw new RequestError("Entregas indisponíveis.", 503);
  return {
    environment,
    customer: requireSecret("UBER_CUSTOMER_ID"),
    client: requireSecret("UBER_CLIENT_ID"),
    secret: requireSecret("UBER_CLIENT_SECRET"),
  };
}
