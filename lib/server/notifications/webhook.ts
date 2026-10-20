import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { commerceEnvironment, requireSecret } from "../commerce-config";
import { rawBody, hash } from "../commerce-http";
import { RequestError } from "../http";
import { orderRepository } from "../orders/repository";

/** Svix signs id.timestamp.raw-body. Preserve exact bytes, including Unicode. */
export function verifyResendSignature(
  raw: Buffer,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get("svix-id") ?? "";
  const timestamp = headers.get("svix-timestamp") ?? "";
  const signatures = headers.get("svix-signature") ?? "";
  if (
    !/^[\w-]{1,200}$/.test(id) ||
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !/^whsec_[A-Za-z0-9+/=]+$/.test(secret) ||
    signatures.length > 2000
  )
    return false;
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 16) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.`)
    .update(raw)
    .digest();
  return signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (
      version !== "v1" ||
      !signature ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)
    )
      return false;
    const actual = Buffer.from(signature, "base64");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
}

export async function ingestResend(request: Request) {
  const raw = await rawBody(request, 64000);
  if (
    !verifyResendSignature(
      raw,
      request.headers,
      requireSecret("RESEND_WEBHOOK_SECRET"),
    )
  )
    throw new RequestError("Não autorizado.", 401);
  const schema = z.object({
    type: z.string().max(80),
    created_at: z.iso.datetime({ offset: true }),
    data: z.object({
      email_id: z.uuid(),
      from: z.string().max(240),
      tags: z.record(z.string().max(256), z.string().max(256)).default({}),
    }),
  });
  let event: z.infer<typeof schema>;
  try {
    event = schema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    throw new RequestError("Notificação inválida.");
  }
  const domain = requireSecret("RESEND_DOMAIN").toLowerCase();
  const address = event.data.from.match(/<([^<>]+)>$/)?.[1] ?? event.data.from;
  const environment = commerceEnvironment();
  const notificationId = z.uuid().safeParse(event.data.tags.notification_id);
  const quarantine =
    address.split("@")[1]?.toLowerCase() !== domain
      ? "UNMATCHED_SENDER"
      : event.data.tags.environment !== environment
        ? "UNMATCHED_ENVIRONMENT"
        : !notificationId.success
          ? "UNMATCHED_NOTIFICATION"
          : null;
  await orderRepository().rpc("commerce_ingest_event", {
    p_data: {
      provider: "resend",
      account: domain,
      environment,
      event_identity: request.headers.get("svix-id"),
      resource_id: event.data.email_id,
      provider_time: event.created_at,
      payload_hash: hash(raw),
      payload: {
        type: event.type,
        from: quarantine ? null : address.toLowerCase(),
        notification_id: notificationId.success ? notificationId.data : null,
        quarantine_reason: quarantine,
      },
    },
  });
}
