import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hash, rawBody } from "../commerce-http";
import { commerceEnvironment, requireSecret } from "../commerce-config";
import { RequestError } from "../http";
import { orderRepository } from "../orders/repository";
import { messageId, smsRequestSchema, twilioCredentials } from "./twilio";
import type { SmsNotification } from "./sms-service";

/** Form callbacks sign the exact public URL followed by all sorted decoded parameters. */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  token: string,
) {
  if (!/^[A-Za-z0-9+/]{27}=$/.test(signature)) return false;
  const input =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = createHmac("sha1", token).update(input, "utf8").digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function ingestTwilio(request: Request) {
  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!/^[A-Za-z0-9+/]{27}=$/.test(signature))
    throw new RequestError("Não autorizado.", 401);
  const raw = await rawBody(
    request,
    16000,
    "application/x-www-form-urlencoded",
  );
  const url = new URL(request.url);
  const id = z.uuid().safeParse(url.searchParams.get("notification_id"));
  if (!id.success || url.searchParams.getAll("notification_id").length !== 1)
    throw new RequestError("Não autorizado.", 401);
  const form = new URLSearchParams(raw.toString("utf8"));
  const params: Record<string, string> = Object.create(null);
  for (const [key, value] of form) {
    if (Object.hasOwn(params, key) || key.length > 100 || value.length > 2000)
      throw new RequestError("Notificação inválida.");
    params[key] = value;
  }
  const c = twilioCredentials();
  const site = new URL(requireSecret("NEXT_PUBLIC_SITE_URL"));
  const signedUrl = `${site.origin}${url.pathname}${url.search}`;
  if (
    site.protocol !== "https:" ||
    url.pathname !== "/api/webhooks/twilio" ||
    !verifyTwilioSignature(signedUrl, params, signature, c.token)
  )
    throw new RequestError("Não autorizado.", 401);
  if (params.AccountSid !== c.account)
    throw new RequestError("Conta inválida.", 403);
  if (
    !messageId.safeParse(params.MessageSid).success ||
    !params.MessageStatus ||
    params.MessageStatus.length > 80
  )
    throw new RequestError("Notificação inválida.");
  const repo = orderRepository();
  const { data, error } = await repo.db
    .from("notifications")
    .select("*")
    .eq("id", id.data)
    .eq("channel", "sms")
    .maybeSingle();
  if (error) throw error;
  const n = data as SmsNotification | null;
  const frozen = smsRequestSchema.safeParse(n?.request);
  if (frozen.success && frozen.data.callback !== signedUrl)
    throw new RequestError("Não autorizado.", 401);
  const environment = commerceEnvironment();
  const quarantine =
    !n || !n.first_dispatch_at || !frozen.success
      ? "UNMATCHED_NOTIFICATION"
      : n.environment !== environment
        ? "UNMATCHED_ENVIRONMENT"
        : frozen.data.account !== c.account ||
            params.To !== frozen.data.to[0] ||
            (frozen.data.from && params.From !== frozen.data.from) ||
            (n.provider_id && n.provider_id !== params.MessageSid)
          ? "UNMATCHED_NOTIFICATION"
          : null;
  await repo.rpc("commerce_ingest_event", {
    p_data: {
      provider: "twilio",
      account: c.account,
      environment,
      event_identity: `${params.MessageSid}:${hash(raw)}`,
      resource_id: params.MessageSid,
      payload_hash: hash(raw),
      payload: { notification_id: id.data, quarantine_reason: quarantine },
    },
  });
}
