import { z } from "zod";
import { getCatalogItem } from "./products";
export const eventNames = [
  "landing_view",
  "order_cta_clicked",
  "category_clicked",
  "product_viewed",
  "product_added",
  "product_removed",
  "cart_opened",
  "checkout_started",
  "location_entered",
  "waitlist_submitted",
  "share_clicked",
] as const;
export const attributionSchema = z.object({
  utm_source: z.string().max(160).optional(),
  utm_medium: z.string().max(160).optional(),
  utm_campaign: z.string().max(160).optional(),
  utm_content: z.string().max(160).optional(),
});
export const cartSchema = z
  .array(
    z.object({
      id: z.string().refine((id) => !!getCatalogItem(id)),
      quantity: z.number().int().min(1).max(30),
    }),
  )
  .max(50)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length);
export const locationSchema = z.object({
  city: z.string().trim().min(2, "Indica a tua cidade.").max(80),
  postcode: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{3}$/, "Usa o formato 1000-001."),
});
export const contactSchema = z
  .string()
  .trim()
  .max(180)
  .refine(
    (value) =>
      z.email().safeParse(value).success ||
      /^(?:\+351|00351)?[29]\d{8}$/.test(value.replace(/[\s()-]/g, "")),
    "Indica um email válido ou um número português.",
  );
export const orderSchema = z.object({
  session_id: z.uuid(),
  items: cartSchema,
  location: locationSchema.optional(),
  attribution: attributionSchema.default({}),
  reached_checkout: z.boolean().default(false),
});
export const leadSchema = orderSchema.extend({
  location: locationSchema,
  contact: contactSchema,
  consent: z.literal(true),
  website: z.string().max(0).optional(),
});
export const merchantSchema = z.object({
  store_name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  contact_name: z.string().trim().min(2).max(120),
  contact: contactSchema,
  consent: z.literal(true),
  website: z.string().max(0).optional(),
});
export const eventSchema = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  name: z.enum(eventNames),
  properties: z
    .object({
      product: z.string().max(100).optional(),
      category: z.string().max(40).optional(),
      basket_value: z.number().min(0).max(100000).optional(),
      item_count: z.number().int().min(0).max(1500).optional(),
      quantity: z.number().int().min(1).max(30).optional(),
      city: z.string().max(80).optional(),
      postcode: z.string().max(12).optional(),
      source: z.string().max(50).optional(),
      ...attributionSchema.shape,
    })
    .default({}),
});
export type OrderInput = z.infer<typeof orderSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
