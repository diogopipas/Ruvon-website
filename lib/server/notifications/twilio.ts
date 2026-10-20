import "server-only";
import { z } from "zod";
import { requireSecret } from "../commerce-config";
import { ProviderError, providerJson } from "../payments/http";

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
const accountId = z.string().regex(/^AC[0-9a-f]{32}$/i);
const serviceId = z.string().regex(/^MG[0-9a-f]{32}$/i);
export const messageId = z.string().regex(/^SM[0-9a-f]{32}$/i);
export const smsRequestSchema = z
  .object({
    account: accountId,
    from: phone.nullable(),
    service: serviceId.nullable(),
    to: z.tuple([phone]),
    text: z.string().min(1).max(1000),
    callback: z.url(),
  })
  .strict()
  .refine((r) => !!r.from !== !!r.service);
export type SmsRequest = z.infer<typeof smsRequestSchema>;
const status = z.enum([
  "accepted",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "delivered",
  "failed",
  "undelivered",
  "canceled",
]);
const messageSchema = z.object({
  sid: messageId,
  account_sid: accountId,
  messaging_service_sid: serviceId.nullable(),
  from: phone.nullable(),
  to: phone,
  body: z.string().max(1600),
  direction: z.literal("outbound-api"),
  status,
  error_code: z.number().int().nonnegative().nullable(),
});
export type SmsFact = ReturnType<typeof smsFact>;
export function twilioCredentials() {
  const account = accountId.safeParse(requireSecret("TWILIO_ACCOUNT_SID"));
  if (!account.success) throw new ProviderError("invalid_sms_account", true);
  return {
    account: account.data,
    token: requireSecret("TWILIO_AUTH_TOKEN", 16),
  };
}
export function smsCallback(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new ProviderError("invalid_notification_id", true);
  const url = new URL(requireSecret("TWILIO_STATUS_CALLBACK_URL"));
  const site = new URL(requireSecret("NEXT_PUBLIC_SITE_URL"));
  if (
    url.protocol !== "https:" ||
    url.origin !== site.origin ||
    url.pathname !== "/api/webhooks/twilio" ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.has("notification_id")
  )
    throw new ProviderError("invalid_sms_callback", true);
  url.searchParams.set("notification_id", id);
  return url.toString();
}
export async function smsSendingConfig() {
  if (process.env.RUVON_SMS_ENABLED !== "true")
    throw new ProviderError("sms_disabled", true);
  const credentials = twilioCredentials();
  const account = await providerJson(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.account}.json`,
    { method: "GET", headers: auth(credentials) },
  );
  if (
    account.sid !== credentials.account ||
    account.status !== "active" ||
    account.type !== "Full"
  )
    throw new ProviderError(
      "sms_custom_content_requires_active_full_account",
      true,
    );
  const from = process.env.TWILIO_FROM_NUMBER?.trim() || null;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || null;
  if (
    !!from === !!service ||
    (from && !phone.safeParse(from).success) ||
    (service && !serviceId.safeParse(service).success)
  )
    throw new ProviderError("invalid_sms_sender", true);
  return { ...credentials, from, service };
}
function auth(c: ReturnType<typeof twilioCredentials>) {
  return {
    Authorization: `Basic ${Buffer.from(`${c.account}:${c.token}`).toString("base64")}`,
  };
}
export function smsFact(raw: unknown, request: SmsRequest) {
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError("invalid_sms_response");
  const m = parsed.data;
  if (
    m.account_sid !== request.account ||
    m.to !== request.to[0] ||
    m.body !== request.text ||
    (request.from && m.from !== request.from) ||
    (request.service && m.messaging_service_sid !== request.service)
  )
    throw new ProviderError("sms_identity_conflict");
  return {
    id: m.sid,
    account: m.account_sid,
    to: m.to,
    from: m.from,
    service: m.messaging_service_sid,
    status: m.status,
    error_code: m.error_code,
  };
}
/** Only call after a database dispatch grant. There is no assumed POST replay protection. */
export async function sendSms(request: SmsRequest) {
  const c = twilioCredentials();
  const r = smsRequestSchema.parse(request);
  if (r.account !== c.account)
    throw new ProviderError("sms_configuration_changed");
  const body = new URLSearchParams({
    To: r.to[0],
    Body: r.text,
    StatusCallback: r.callback,
  });
  if (r.from) body.set("From", r.from);
  if (r.service) body.set("MessagingServiceSid", r.service);
  return smsFact(
    await providerJson(
      `https://api.twilio.com/2010-04-01/Accounts/${c.account}/Messages.json`,
      {
        method: "POST",
        headers: {
          ...auth(c),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    ),
    r,
  );
}
export async function readSms(id: string, request: SmsRequest) {
  const c = twilioCredentials();
  if (!messageId.safeParse(id).success || request.account !== c.account)
    throw new ProviderError("sms_identity_conflict");
  const fact = smsFact(
    await providerJson(
      `https://api.twilio.com/2010-04-01/Accounts/${c.account}/Messages/${id}.json`,
      { method: "GET", headers: auth(c) },
    ),
    request,
  );
  if (fact.id !== id) throw new ProviderError("sms_identity_conflict");
  return fact;
}
