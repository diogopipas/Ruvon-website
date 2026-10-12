import "server-only";
import { z } from "zod";
import type { DeliveryAddress } from "@/lib/commerce";
import { uberConfig } from "../commerce-config";
import { ProviderError, providerJson } from "../payments/http";
import type { ProviderOperation, ProviderFact } from "../payments/provider";
import type { DeliveryProvider, DeliveryQuote } from "./provider";
const deliverySchema = z
  .object({
    id: z.string().regex(/^(?:del|ret)_[A-Za-z0-9_-]+$/),
    status: z.enum([
      "pending",
      "pickup",
      "pickup_complete",
      "dropoff",
      "delivered",
      "canceled",
      "returned",
    ]),
    live_mode: z.boolean(),
    currency: z.string(),
    fee: z.number().int().nonnegative(),
    quote_id: z.string().optional(),
    tracking_url: z.url({ protocol: /^https$/ }).optional(),
    dropoff_eta: z.iso.datetime({ offset: true }).optional(),
    related_deliveries: z
      .array(z.object({ id: z.string(), relationship: z.string() }))
      .nullable()
      .optional(),
  })
  .passthrough();
let cachedToken: { client: string; value: string; until: number } | undefined;
export class UberDirectProvider implements DeliveryProvider {
  private config = uberConfig();
  async request(path: string, method = "GET", body?: unknown) {
    if (!/^\/(?:delivery_quotes|deliveries)(?:[/?]|$)/.test(path))
      throw new ProviderError("invalid_destination");
    if (
      !cachedToken ||
      cachedToken.client !== this.config.client ||
      cachedToken.until <= Date.now()
    ) {
      const result = await providerJson(
        "https://auth.uber.com/oauth/v2/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: this.config.client,
            client_secret: this.config.secret,
            grant_type: "client_credentials",
            scope: "eats.deliveries",
          }).toString(),
        },
      );
      const token = z
        .object({
          access_token: z.string().min(1),
          expires_in: z.number().positive(),
        })
        .parse(result);
      cachedToken = {
        client: this.config.client,
        value: token.access_token,
        until: Date.now() + (token.expires_in - 60) * 1000,
      };
    }
    return providerJson(
      `https://api.uber.com/v1/customers/${encodeURIComponent(this.config.customer)}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${cachedToken.value}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  }
  async quote(
    pickup: DeliveryAddress,
    dropoff: DeliveryAddress,
  ): Promise<DeliveryQuote> {
    const response = await this.request("/delivery_quotes", "POST", {
      pickup_address: JSON.stringify(pickup),
      dropoff_address: JSON.stringify(dropoff),
    });
    const q = z
      .object({
        id: z.string().startsWith("dqt_"),
        expires: z.iso.datetime({ offset: true }),
        fee: z.number().int().nonnegative(),
        currency: z.string(),
        dropoff_eta: z.iso.datetime({ offset: true }),
      })
      .parse(response);
    if (
      q.currency.toUpperCase() !== "EUR" ||
      Date.parse(q.expires) <= Date.now()
    )
      throw new ProviderError("invalid_quote");
    return {
      id: q.id,
      expires_at: q.expires,
      fee: q.fee,
      eta: q.dropoff_eta,
      pickup_address: pickup,
      dropoff_address: dropoff,
    };
  }
  async read(id: string) {
    if (!/^(?:del|ret)_[A-Za-z0-9_-]+$/.test(id))
      throw new ProviderError("invalid_delivery_id");
    const d = deliverySchema.parse(
      await this.request(`/deliveries/${encodeURIComponent(id)}`),
    );
    if (
      d.id !== id ||
      d.live_mode !== (this.config.environment === "live") ||
      d.currency.toUpperCase() !== "EUR"
    )
      throw new ProviderError("delivery_identity_conflict");
    return d;
  }
  async mutate(op: ProviderOperation): Promise<ProviderFact> {
    try {
      const response = await this.request(
        op.request.path,
        op.request.method,
        op.request.body,
      );
      const d = deliverySchema.parse(response);
      if (
        d.live_mode !== (this.config.environment === "live") ||
        d.currency.toUpperCase() !== "EUR" ||
        d.external_id !== op.order_id ||
        !d.id.startsWith("del_") ||
        d.quote_id !== op.request.body.quote_id
      )
        throw new ProviderError("delivery_identity_conflict");
      return {
        state: "succeeded",
        resource_id: d.id,
        status: d.status,
        quote_id: d.quote_id,
        tracking_url: d.tracking_url,
        cost: d.fee,
        eta: d.dropoff_eta,
      };
    } catch (e) {
      return {
        state:
          e instanceof ProviderError && e.definitive ? "failed" : "unknown",
        error_class:
          e instanceof ProviderError
            ? e.classification
            : "invalid_provider_response",
      };
    }
  }
  async reconcile(op: ProviderOperation, hint?: string): Promise<ProviderFact> {
    if (!op.provider_resource_id && !hint)
      return { state: "unknown", error_class: "booking_identity_unknown" };
    const d = await this.read(op.provider_resource_id ?? hint!);
    if (
      d.external_id !== op.order_id ||
      !d.id.startsWith("del_") ||
      d.quote_id !== op.request.body.quote_id
    )
      throw new ProviderError("delivery_order_conflict");
    return {
      state: "succeeded",
      resource_id: d.id,
      status: d.status,
      quote_id: d.quote_id,
      tracking_url: d.tracking_url,
      cost: d.fee,
      eta: d.dropoff_eta,
    };
  }
}
