import { z } from "zod";
import { getCatalogItem, packById } from "./products";
import { packOptions } from "./packs";
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
  "pack_group_selected",
  "pack_options_changed",
] as const;
export const attributionSchema = z.object({
  utm_source: z.string().max(160).optional(),
  utm_medium: z.string().max(160).optional(),
  utm_campaign: z.string().max(160).optional(),
  utm_content: z.string().max(160).optional(),
});
export const packOptionsSchema = z
  .object({
    beer: z.enum(["super-bock", "sagres"]).optional(),
    vodka: z.enum(["eristoff", "smirnoff"]).optional(),
    gin: z.enum(["gordons", "beefeater"]).optional(),
    alcoholFreeBeer: z.enum(["super-bock-zero", "sagres-zero"]).optional(),
    mixer: z
      .enum(["coca-cola", "coca-cola-zero", "seven-up", "none"])
      .optional(),
    snack: z.enum(["doritos", "pringles", "none"]).optional(),
    ice: z.enum(["included", "none"]).optional(),
    water: z.enum(["included", "none"]).optional(),
    cups: z.enum(["included", "none"]).optional(),
    peanuts: z.enum(["included", "none"]).optional(),
    limes: z.enum(["included", "none"]).optional(),
  })
  .strict();
const optionKeySchema = z.enum([
  "beer",
  "vodka",
  "gin",
  "alcoholFreeBeer",
  "mixer",
  "snack",
  "ice",
  "water",
  "cups",
  "peanuts",
  "limes",
]);
export const cartSchema = z
  .array(
    z
      .object({
        id: z.string().refine((id) => !!getCatalogItem(id)),
        quantity: z.number().int().min(1).max(30),
        options: packOptionsSchema.optional(),
      })
      .superRefine((item, ctx) => {
        const pack = packById.get(item.id);
        try {
          if (pack) packOptions(pack, item.options);
          else if (item.options && Object.keys(item.options).length)
            throw new Error();
        } catch {
          ctx.addIssue({
            code: "custom",
            message: "Opção indisponível para este artigo.",
            path: ["options"],
          });
        }
      })
      .transform((item) => {
        const pack = packById.get(item.id);
        return pack
          ? { ...item, options: packOptions(pack, item.options) }
          : item;
      }),
  )
  .max(50)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length);
export const locationSchema = z.object({
  city: z.string().trim().min(2, "Indica a tua cidade.").max(80),
  postcode: z
    .string()
    .trim()
    .transform((value) =>
      value.replace(/\s/g, "").replace(/^(\d{4})(\d{3})$/, "$1-$2"),
    )
    .pipe(z.string().regex(/^\d{4}-\d{3}$/, "Usa o formato 1000-001.")),
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
  consent: z.literal(true, {
    error: "Aceita o contacto para entrar na lista.",
  }),
  website: z.string().max(0).optional(),
});
export const merchantSchema = z.object({
  submission_id: z.uuid().optional(),
  store_name: z.string().trim().min(2, "Indica o nome da loja.").max(120),
  city: z.string().trim().min(2, "Indica a cidade da loja.").max(80),
  contact_name: z.string().trim().min(2, "Indica o teu nome.").max(120),
  contact: contactSchema,
  consent: z.literal(true, { error: "Aceita o contacto sobre a parceria." }),
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
      product_type: z.enum(["pack", "individual"]).optional(),
      pack_id: z.string().max(100).optional(),
      pack_name: z.string().max(100).optional(),
      pack_price: z.number().min(0).max(1000).optional(),
      default_pack_price: z.number().min(0).max(1000).optional(),
      pack_tier: z.enum(["primary", "secondary"]).optional(),
      people_min: z.number().int().min(1).max(50).optional(),
      people_max: z.number().int().min(1).max(50).optional(),
      selected_options: packOptionsSchema.optional(),
      previous_options: packOptionsSchema.optional(),
      removed_extras: z.array(optionKeySchema).max(11).optional(),
      changed_options: z.array(optionKeySchema).max(11).optional(),
      previous_pack_price: z.number().min(0).max(1000).optional(),
      price_delta: z.number().min(-1000).max(1000).optional(),
      changes: z
        .array(
          z.object({
            option: optionKeySchema,
            from: z.string().max(40),
            to: z.string().max(40),
            action: z.enum(["removed", "restored", "swapped"]),
          }),
        )
        .max(11)
        .optional(),
      contains_pack: z.boolean().optional(),
      after_pack: z.boolean().optional(),
      group_size: z.enum(["all", "2-3", "4-6", "7+"]).optional(),
      packs: z
        .array(
          z.object({
            product_type: z.literal("pack"),
            pack_id: z.string().max(100),
            pack_name: z.string().max(100),
            pack_price: z.number().min(0).max(1000),
            default_pack_price: z.number().min(0).max(1000).optional(),
            pack_tier: z.enum(["primary", "secondary"]).optional(),
            people_min: z.number().int().min(1).max(50),
            people_max: z.number().int().min(1).max(50),
            selected_options: packOptionsSchema,
            removed_extras: z.array(optionKeySchema).max(11).optional(),
            quantity: z.number().int().min(1).max(30),
          }),
        )
        .max(6)
        .optional(),
      ...attributionSchema.shape,
    })
    .default({}),
});
export type OrderInput = z.infer<typeof orderSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
