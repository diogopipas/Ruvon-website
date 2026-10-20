import "server-only";
import { z } from "zod";
import { requireSecret } from "../commerce-config";
import { ProviderError, providerJson } from "../payments/http";

export type EmailRequest = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
  tags: { name: string; value: string }[];
};

export function emailConfig() {
  const domain = requireSecret("RESEND_DOMAIN").toLowerCase();
  const from = requireSecret("RESEND_FROM");
  const address = from.match(/<([^<>]+)>$/)?.[1] ?? from;
  if (
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ||
    !z.email().safeParse(address).success ||
    address.split("@")[1].toLowerCase() !== domain ||
    /[\r\n]/.test(from)
  )
    throw new ProviderError("invalid_email_sender", true);
  const replyTo = z.email().safeParse(requireSecret("RESEND_REPLY_TO"));
  if (!replyTo.success) throw new ProviderError("invalid_email_reply_to", true);
  return {
    key: requireSecret("RESEND_API_KEY"),
    domain,
    from,
    replyTo: replyTo.data,
  };
}

/** A successful POST means accepted by Resend, not delivered to an inbox.
 * The caller persists the exact request and key before calling this method. */
export async function sendEmail(request: EmailRequest, key: string) {
  const config = emailConfig();
  const address = request.from.match(/<([^<>]+)>$/)?.[1] ?? request.from;
  if (
    address.split("@")[1]?.toLowerCase() !== config.domain ||
    !key ||
    key.length > 256
  )
    throw new ProviderError("email_configuration_changed");
  const response = await providerJson("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(request),
  });
  const id = z.uuid().safeParse(response.id);
  if (!id.success) throw new ProviderError("invalid_email_response");
  return id.data;
}
