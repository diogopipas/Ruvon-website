import { z } from "zod";
import { cartSchema } from "./validation";
import { mbwayPhoneSchema } from "./payments";

export const orderStates = [
  "awaiting_payment",
  "awaiting_merchant",
  "confirming",
  "preparing",
  "ready_for_pickup",
  "in_delivery",
  "delivered",
  "completed",
  "cancelling",
  "cancelled",
  "returning",
  "returned",
  "manual_review",
] as const;
export type OrderState = (typeof orderStates)[number];
export const paymentStates = [
  "not_started",
  "authorisation_pending",
  "authorised",
  "capture_pending",
  "paid",
  "void_pending",
  "voided",
  "failed",
  "expired",
  "unknown",
] as const;
export type CommercePaymentState = (typeof paymentStates)[number];
export const addressSchema = z
  .object({
    street_address: z.array(z.string().trim().min(3).max(160)).min(1).max(2),
    city: z.string().trim().min(2).max(80),
    zip_code: z
      .string()
      .regex(/^\d{4}-\d{3}$/, "Indica um código postal português completo."),
    country: z.literal("PT"),
  })
  .strict();
export type DeliveryAddress = z.infer<typeof addressSchema>;
export const quoteSchema = z
  .object({
    checkout_key: z.uuid(),
    items: cartSchema.min(1),
    address: addressSchema,
  })
  .strict();
export const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: mbwayPhoneSchema,
    email: z.union([z.email().max(180), z.literal("")]).optional(),
  })
  .strict();
export const startOrderSchema = z
  .object({
    quote_id: z.uuid(),
    command_id: z.uuid(),
    contact: contactSchema,
    method: z.enum(["MBW", "CC"]),
    age_confirmed: z.literal(true),
    terms_confirmed: z.literal(true),
    retry: z.boolean().default(false),
  })
  .strict();
export const commandSchema = z
  .object({
    command_id: z.uuid(),
    expected_version: z.number().int().nonnegative(),
    command: z.enum([
      "accept",
      "reject",
      "unavailable",
      "ready",
      "correct_ready",
      "return_received",
      "pause",
      "resume",
    ]),
    reason: z.string().trim().max(400).optional(),
    seal: z.string().trim().max(80).optional(),
    saleable: z.record(z.string(), z.number().int().nonnegative()).optional(),
  })
  .strict();
export const cancelSchema = z
  .object({
    command_id: z.uuid(),
    expected_version: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(400),
  })
  .strict();
export const issueSchema = cancelSchema.extend({
  type: z.enum(["missing_item", "wrong_item", "damaged", "delivery", "other"]),
  evidence: z.array(z.uuid()).max(10).default([]),
});
export type Recipe = { sku: string; quantity: number }[];
export type CommerceLine = {
  id: string;
  name: string;
  quantity: number;
  options?: Record<string, string>;
  unit_price: number;
  line_price: number;
  recipe: Recipe;
  components: { sku: string; quantity: number; unit_price: number }[];
};
export type Allocation = {
  commission_bps: number;
  products: number;
  commission: number;
  merchant: number;
  service: number;
  delivery: number;
  ruvon: number;
  total: number;
};
export type CommerceOrder = {
  id: string;
  owner_hash: string;
  checkout_key: string;
  snapshot_hash: string;
  flow_version: number;
  environment: "sandbox" | "live";
  store_id: string;
  operational_status: OrderState;
  version: number;
  payment_status: CommercePaymentState;
  merchant_status: string;
  settlement_status: string;
  items: CommerceLine[];
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  currency: "EUR";
  quote_snapshot: {
    id: string;
    expires_at: string;
    fee: number;
    eta: string;
    pickup_address: DeliveryAddress;
    dropoff_address: DeliveryAddress;
  };
  quote_expires_at: string;
  acceptance_deadline: string | null;
  reservation_expires_at: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  delivery_address: DeliveryAddress;
  allocation: Allocation;
  contains_alcohol: boolean;
  requires_age_verification: boolean;
  current_attempt_id: string | null;
  created_at: string;
  paid_at: string | null;
  review_reason: string | null;
  cancellation_reason: string | null;
};
export type OrderView = Pick<
  CommerceOrder,
  | "id"
  | "operational_status"
  | "version"
  | "payment_status"
  | "merchant_status"
  | "settlement_status"
  | "items"
  | "subtotal"
  | "delivery_fee"
  | "service_fee"
  | "total"
  | "currency"
  | "acceptance_deadline"
  | "created_at"
  | "quote_expires_at"
> & {
  eta: string;
  tracking_url: string | null;
  refunded: number;
  allowed_actions: ("cancel" | "request_review" | "report_issue")[];
  payment_url?: string | null;
};
