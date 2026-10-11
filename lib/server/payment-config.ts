import "server-only";
import { RequestError } from "./http";

/** A production deployment cannot opt into sandbox by changing just the flag. */
export function sandboxRequested() {
  return (
    (process.env.RUVON_PAYMENTS_MODE ?? process.env.JOLA_PAYMENTS_MODE) ===
      "sandbox" &&
    process.env.VERCEL_ENV !== "production" &&
    (!process.env.VERCEL || process.env.VERCEL_ENV === "preview")
  );
}

export function sandboxDatabaseConfig() {
  const url = (
    process.env.RUVON_SANDBOX_SUPABASE_URL ??
    process.env.JOLA_SANDBOX_SUPABASE_URL
  )?.trim();
  const key = (
    process.env.RUVON_SANDBOX_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.JOLA_SANDBOX_SUPABASE_SERVICE_ROLE_KEY
  )?.trim();
  if (!url || !key)
    throw new RequestError("Falta configurar a base de dados de testes.", 503);
  const origin = new URL(url).origin;
  if (
    origin ===
      (process.env.SUPABASE_URL
        ? new URL(process.env.SUPABASE_URL).origin
        : "") ||
    key === process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
    throw new RequestError(
      "Os pagamentos de teste precisam de um projeto Supabase separado.",
      503,
    );
  return { url, key };
}

export function paymentConfig() {
  if (!sandboxRequested())
    throw new RequestError("Pagamento indisponível.", 404);
  const accountId = process.env.EASYPAY_ACCOUNT_ID?.trim();
  const apiKey = process.env.EASYPAY_API_KEY?.trim();
  const webhookUser = process.env.EASYPAY_WEBHOOK_USERNAME?.trim();
  const webhookPassword = process.env.EASYPAY_WEBHOOK_PASSWORD?.trim();
  if (
    !accountId ||
    !apiKey ||
    !webhookUser ||
    !webhookPassword ||
    webhookPassword.length < 32
  )
    throw new RequestError(
      "Falta concluir a configuração MB WAY de testes.",
      503,
    );
  sandboxDatabaseConfig();
  return {
    accountId,
    apiKey,
    webhookUser,
    webhookPassword,
    // Deliberately fixed: this delivery contains no live-money code path.
    baseUrl: "https://api.test.easypay.pt/2.0",
  };
}
