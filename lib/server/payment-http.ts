import "server-only";
import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { RequestError } from "./http";
import { hashPaymentOwner } from "./payment-store";
import { paymentConfig } from "./payment-config";

export const paymentCookie = "jola_payment_owner";

export async function paymentOwner(create = false) {
  const jar = await cookies();
  const current = jar.get(paymentCookie)?.value;
  if (current && /^[0-9a-f]{64}$/.test(current))
    return hashPaymentOwner(current);
  if (!create)
    throw new RequestError("Pedido indisponível neste dispositivo.", 404);
  const token = randomBytes(32).toString("hex");
  jar.set(paymentCookie, token, {
    httpOnly: true,
    secure: !!process.env.VERCEL || process.env.NODE_ENV !== "development",
    sameSite: "strict",
    path: "/api/payment-orders",
    maxAge: 7 * 86400,
  });
  return hashPaymentOwner(token);
}

export function requirePaymentOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new RequestError("Origem inválida.", 403);
}

export function verifyWebhookAuth(request: Request) {
  const config = paymentConfig();
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(
    `Basic ${Buffer.from(`${config.webhookUser}:${config.webhookPassword}`).toString("base64")}`,
  );
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new RequestError("Notificação não autorizada.", 401);
}

export const easypayNotificationSchema = z
  .object({
    id: z.uuid(),
    key: z.uuid(),
    type: z.string().max(50),
    status: z.enum(["success", "failed"]),
  })
  .passthrough();

/** Server callbacks have no browser Origin; don't reuse that guard here. */
export async function webhookJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new RequestError("Formato inválido.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Notificação inválida.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) {
      await reader.cancel();
      throw new RequestError("Notificação demasiado grande.", 413);
    }
    chunks.push(value);
  }
  try {
    return easypayNotificationSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    throw new RequestError("Notificação inválida.");
  }
}
