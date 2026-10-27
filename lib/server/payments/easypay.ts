import "server-only";
import { z } from "zod";
import { providerCents } from "@/lib/payments";
import { easypayAccountConfig } from "../commerce-config";
import { ProviderError, providerJson } from "./http";
import type {
  PaymentProvider,
  ProviderFact,
  ProviderOperation,
} from "./provider";

const resource = z
  .object({
    id: z.uuid(),
    transaction_key: z.string().optional(),
    status: z.string().optional(),
    value: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();
const single = resource.extend({
  type: z.literal("authorisation"),
  key: z.string(),
  currency: z.literal("EUR"),
  method: z.object({ type: z.enum(["MBW", "CC"]) }),
  payment_status: z.string(),
  expiration_time: z.string().optional(),
  captures: z.array(resource).optional(),
});
const status = (value: unknown): ProviderFact["state"] =>
  value === "success"
    ? "succeeded"
    : value === "failed"
      ? "failed"
      : ["waiting", "pending", "processing", "delayed"].includes(String(value))
        ? "pending"
        : "unknown";
const id = (value: unknown) => z.uuid().parse(value);
export class EasypayProvider implements PaymentProvider {
  private config = easypayAccountConfig();
  /** Check before granting dispatch, including after account/environment rotation. */
  assertOperation(op: ProviderOperation) {
    if (
      op.provider !== "easypay" ||
      op.account !== this.config.account ||
      op.environment !== this.config.environment
    )
      throw new ProviderError("payment_configuration_conflict");
    if (!z.uuid().safeParse(op.idempotency_key).success)
      throw new ProviderError("invalid_payment_operation");
    const request = op.request;
    if (op.kind === "authorise") {
      const amount = request.amount;
      if (
        !z.uuid().safeParse(op.attempt_id).success ||
        op.idempotency_key !== op.attempt_id ||
        !Number.isSafeInteger(amount) ||
        Number(amount) <= 0 ||
        request.method !== "POST"
      )
        throw new ProviderError("invalid_authorisation_request");
      if (request.path === "/single") {
        if (
          request.body.type !== "authorisation" ||
          request.body.method !== "MBW" ||
          request.body.currency !== "EUR" ||
          request.body.key !== op.attempt_id ||
          providerCents(request.body.value) !== amount ||
          request.body.capture !== undefined
        )
          throw new ProviderError("invalid_authorisation_request");
      } else if (request.path === "/checkout") {
        const body = z
          .object({
            type: z.tuple([z.literal("single")]),
            payment: z.object({
              methods: z.tuple([z.literal("CC")]),
              type: z.literal("authorisation"),
              currency: z.literal("EUR"),
              key: z.string(),
              capture: z.never().optional(),
            }),
            order: z.object({ key: z.string(), value: z.number() }),
          })
          .safeParse(request.body);
        if (
          !body.success ||
          body.data.payment.key !== op.attempt_id ||
          body.data.order.key !== op.attempt_id ||
          providerCents(body.data.order.value) !== amount
        )
          throw new ProviderError("invalid_authorisation_request");
      } else throw new ProviderError("invalid_authorisation_request");
      return;
    }
    const parent = z.uuid().safeParse(request.parent_id);
    if (!parent.success) throw new ProviderError("invalid_payment_operation");
    if (op.kind === "split_schedule") {
      const split = z.uuid().safeParse(request.split_id);
      if (
        !split.success ||
        request.path !== `/capture/${parent.data}/splits/${split.data}` ||
        request.method !== "PATCH" ||
        !z.iso.date().safeParse(request.body.clearing_date).success
      )
        throw new ProviderError("invalid_payment_operation");
      return;
    }
    if (
      !["capture", "void", "refund"].includes(op.kind) ||
      request.path !== `/${op.kind}/${parent.data}` ||
      request.method !== "POST" ||
      request.body.transaction_key !== op.idempotency_key ||
      (op.kind !== "void" && (providerCents(request.body.value) ?? 0) <= 0)
    )
      throw new ProviderError("invalid_payment_operation");
    if (op.kind === "capture") {
      const splits = z
        .array(
          z.object({
            split_key: z.enum(["merchant", "ruvon"]),
            account: z.object({ id: z.uuid() }),
            value: z.number(),
          }),
        )
        .safeParse(request.body.splits);
      if (
        !splits.success ||
        splits.data.length !== 2 ||
        new Set(splits.data.map((s) => s.split_key)).size !== 2 ||
        splits.data.some((s) => (providerCents(s.value) ?? 0) <= 0) ||
        splits.data.reduce((sum, s) => sum + providerCents(s.value)!, 0) !==
          providerCents(request.body.value)
      )
        throw new ProviderError("invalid_capture_allocation");
    }
  }
  private request(path: string, method = "GET", body?: unknown, key?: string) {
    if (
      !/^\/(?:single|capture|authorisation|void|refund|checkout)(?:[/?]|$)/.test(
        path,
      )
    )
      throw new ProviderError("invalid_destination");
    return providerJson(this.config.base + path, {
      method,
      headers: {
        AccountId: this.config.account,
        ApiKey: this.config.key,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async mutate(op: ProviderOperation): Promise<ProviderFact> {
    try {
      this.assertOperation(op);
      const result = await this.request(
        op.request.path,
        op.request.method,
        op.request.body,
        op.idempotency_key,
      );
      if (op.kind === "authorise" && op.request.path === "/checkout") {
        const manifest = z
          .object({
            id: z.uuid(),
            session: z.string(),
            config: z.unknown().nullable().optional(),
          })
          .parse(result);
        return { state: "pending", checkout_manifest: manifest };
      }
      const resourceId = id(result.id);
      return this.reconcile({ ...op, provider_resource_id: resourceId });
    } catch (e) {
      if (e instanceof ProviderError && e.definitive)
        return { state: "failed", error_class: e.classification };
      return {
        state: "unknown",
        error_class:
          e instanceof ProviderError
            ? e.classification
            : "invalid_provider_response",
      };
    }
  }
  async reconcile(op: ProviderOperation, hint?: string): Promise<ProviderFact> {
    try {
      this.assertOperation(op);
      let resourceId = op.provider_resource_id ?? hint;
      if (op.kind === "authorise") {
        let notifiedAuthorisation: Record<string, unknown> | undefined;
        // A Generic authorisation notification identifies its own resource,
        // not necessarily the Single payment token used for capture/void.
        if (hint) {
          const authorisation = await this.request(
            `/authorisation/${id(hint)}`,
          );
          if (
            authorisation.id !== hint ||
            authorisation.key !== op.attempt_id ||
            authorisation.currency !== "EUR" ||
            z.object({ type: z.string() }).parse(authorisation.method).type !==
              (op.request.path === "/checkout" ? "CC" : "MBW") ||
            providerCents(authorisation.value) !== op.request.amount
          )
            throw new ProviderError("authorisation_identity_conflict");
          notifiedAuthorisation = authorisation;
          resourceId = op.provider_resource_id ?? undefined;
        }
        if (!resourceId && op.checkout_manifest?.id) {
          const checkout = await this.request(
            `/checkout/${id(op.checkout_manifest?.id)}`,
          );
          if (
            z.object({ id: z.uuid() }).parse(checkout.checkout).id !==
            op.checkout_manifest.id
          )
            throw new ProviderError("checkout_identity_conflict");
          const payment = z
            .object({ id: z.uuid(), key: z.string() })
            .safeParse(checkout.payment);
          if (payment.success) {
            if (payment.data.key !== op.attempt_id)
              throw new ProviderError("checkout_identity_conflict");
            resourceId = payment.data.id;
          }
        }
        let payment: z.infer<typeof single>;
        if (resourceId)
          payment = single.parse(
            await this.request(`/single/${id(resourceId)}`),
          );
        else {
          const list = await this.request(
            `/single?key=${encodeURIComponent(op.attempt_id!)}&records_per_page=2`,
          );
          const matches = z
            .array(single)
            .parse(list.data)
            .filter((p) => p.key === op.attempt_id);
          if (matches.length !== 1)
            return {
              state: "unknown",
              error_class: matches.length
                ? "multiple_resources"
                : "resource_not_found",
            };
          payment = matches[0];
        }
        const expectedMethod = op.request.path === "/checkout" ? "CC" : "MBW";
        if (
          (resourceId && payment.id !== resourceId) ||
          payment.key !== op.attempt_id ||
          payment.method.type !== expectedMethod ||
          providerCents(payment.value) !== op.request.amount
        )
          throw new ProviderError("payment_identity_conflict");
        // Authorisation success is historical. A later capture, void or expiry
        // does not erase it; present capture eligibility is checked separately.
        if (op.status === "succeeded")
          return {
            state: "succeeded",
            resource_id: payment.id,
            amount: providerCents(payment.value)!,
          };
        if (
          payment.payment_status === "paid" ||
          payment.captures?.some((c) => c.status !== "failed")
        )
          throw new ProviderError("unexpected_capture");
        if (
          payment.payment_status === "authorised" &&
          notifiedAuthorisation &&
          (notifiedAuthorisation.status !== "success" ||
            (notifiedAuthorisation.value_captured !== undefined &&
              providerCents(notifiedAuthorisation.value_captured) !== 0))
        )
          throw new ProviderError("authorisation_state_conflict");
        // The provider read verifies present validity; never invent an authorisation lifetime.
        return {
          state:
            payment.payment_status === "authorised"
              ? "succeeded"
              : ["failed", "deleted", "voided"].includes(payment.payment_status)
                ? "failed"
                : ["pending", "active"].includes(payment.payment_status)
                  ? "pending"
                  : "unknown",
          resource_id: payment.id,
          amount: providerCents(payment.value)!,
          ...(payment.expiration_time &&
          /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(
            payment.expiration_time,
          )
            ? { expires_at: payment.expiration_time }
            : {}),
        };
      }
      if (op.kind === "capture" && !resourceId) {
        const payment = single.parse(
          await this.request(`/single/${id(op.request.parent_id)}`),
        );
        if (
          payment.id !== op.request.parent_id ||
          payment.key !== op.attempt_id
        )
          throw new ProviderError("capture_parent_conflict");
        const matches =
          payment.captures?.filter(
            (c) => c.transaction_key === op.idempotency_key,
          ) ?? [];
        if (matches.length !== 1)
          return { state: "unknown", error_class: "capture_not_correlated" };
        resourceId = matches[0].id;
      }
      if (op.kind === "refund" && !resourceId) {
        const capture = await this.request(
          `/capture/${id(op.request.parent_id)}`,
        );
        if (capture.id !== op.request.parent_id)
          throw new ProviderError("refund_parent_conflict");
        const refunds = z
          .array(resource)
          .parse(capture.refunds ?? [])
          .filter((r) => r.transaction_key === op.idempotency_key);
        if (refunds.length !== 1)
          return { state: "unknown", error_class: "refund_not_correlated" };
        resourceId = refunds[0].id;
      }
      if (op.kind === "split_schedule") {
        const capture = await this.request(
          `/capture/${id(op.request.parent_id)}`,
        );
        if (capture.id !== op.request.parent_id)
          throw new ProviderError("capture_parent_conflict");
        const splits = z
          .array(z.object({ id: z.uuid(), clearing_date: z.string() }))
          .parse(capture.splits);
        const split = splits.find((s) => s.id === op.request.split_id);
        return split && split.clearing_date === op.request.body.clearing_date
          ? {
              state: "succeeded",
              resource_id: split.id,
              clearing_date: split.clearing_date,
            }
          : { state: "unknown", error_class: "clearing_not_confirmed" };
      }
      if (!resourceId)
        return { state: "unknown", error_class: "resource_not_correlated" };
      const detail = await this.request(`/${op.kind}/${id(resourceId)}`);
      if (
        detail.id !== resourceId ||
        detail.transaction_key !== op.idempotency_key
      )
        throw new ProviderError("operation_identity_conflict");
      if (
        op.kind === "capture" &&
        (detail.payment_type !== "single" ||
          detail.payment_id !== op.request.parent_id)
      )
        throw new ProviderError("capture_parent_conflict");
      if (op.kind === "void") {
        const authorisation = resource
          .extend({
            key: z.string(),
            currency: z.literal("EUR"),
            method: z.object({ type: z.enum(["MBW", "CC"]) }),
          })
          .parse(detail.authorisation);
        const payment = single.parse(
          await this.request(`/single/${id(op.request.parent_id)}`),
        );
        if (
          payment.id !== op.request.parent_id ||
          payment.key !== op.attempt_id ||
          authorisation.key !== op.attempt_id ||
          authorisation.method.type !== payment.method.type ||
          providerCents(authorisation.value) !== providerCents(payment.value) ||
          providerCents(payment.value) === null
        )
          throw new ProviderError("void_parent_conflict");
        if (
          payment.payment_status === "paid" ||
          payment.captures?.some((c) => c.status !== "failed")
        )
          throw new ProviderError("void_state_conflict");
      }
      if (
        op.kind === "refund" &&
        z.object({ id: z.uuid() }).parse(detail.capture).id !==
          op.request.parent_id
      )
        throw new ProviderError("refund_parent_conflict");
      const outcome: ProviderFact = {
        state:
          op.kind === "capture" && detail.status === "refunded"
            ? "succeeded"
            : status(detail.status),
        resource_id: resourceId,
        ...(op.kind !== "void"
          ? { amount: providerCents(detail.value) ?? undefined }
          : {}),
      };
      if (
        op.kind !== "void" &&
        outcome.amount !== providerCents(op.request.body.value)
      )
        throw new ProviderError("operation_amount_conflict");
      if (op.kind === "capture" && outcome.state === "succeeded") {
        const splits = z
          .array(
            z.object({
              id: z.uuid(),
              account: z.object({ id: z.uuid() }),
              split_key: z.enum(["merchant", "ruvon"]),
              value: z.union([z.number(), z.string()]),
              clearing_date: z.string(),
            }),
          )
          .parse(detail.splits);
        outcome.splits = splits.map((s) => ({
          id: s.id,
          account_id: s.account.id,
          beneficiary: s.split_key,
          amount: providerCents(s.value),
          clearing_date: s.clearing_date,
        }));
        const requested = z
          .array(
            z.object({
              split_key: z.string(),
              account: z.object({ id: z.uuid() }),
              value: z.number(),
            }),
          )
          .parse(op.request.body.splits);
        if (
          splits.length !== requested.length ||
          new Set(splits.map((s) => s.id)).size !== splits.length ||
          new Set(splits.map((s) => s.split_key)).size !== splits.length
        )
          throw new ProviderError("split_identity_conflict");
        for (const s of splits)
          if (
            !requested.some(
              (r) =>
                r.split_key === s.split_key &&
                r.account.id === s.account.id &&
                providerCents(r.value) === providerCents(s.value),
            )
          )
            throw new ProviderError("split_identity_conflict");
      }
      return outcome;
    } catch (e) {
      return {
        state: "unknown",
        ...(op.provider_resource_id
          ? { resource_id: op.provider_resource_id }
          : {}),
        error_class:
          e instanceof ProviderError
            ? e.classification
            : "invalid_provider_response",
      };
    }
  }
  async authorisationValid(
    singleId: string,
    attemptId: string,
    amount: number,
    method: "MBW" | "CC",
  ) {
    const value = single.parse(await this.request(`/single/${id(singleId)}`));
    return (
      value.id === singleId &&
      value.key === attemptId &&
      value.method.type === method &&
      providerCents(value.value) === amount &&
      value.payment_status === "authorised" &&
      !value.captures?.some((c) => c.status !== "failed")
    );
  }
}
