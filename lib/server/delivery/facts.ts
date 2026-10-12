import { z } from "zod";

/** Only the verification outcome is retained; identity-document data is discarded. */
export function deliveryFact(
  delivery: Record<string, unknown>,
  parentId?: string,
) {
  const related =
    z
      .array(z.object({ id: z.string(), relationship: z.string() }))
      .nullish()
      .parse(delivery.related_deliveries) ?? [];
  const verification = z
    .object({
      verification: z
        .object({
          identification: z
            .object({ min_age_verified: z.boolean() })
            .optional(),
        })
        .optional(),
    })
    .safeParse(delivery.dropoff);
  const passed = verification.success
    ? verification.data.verification?.identification?.min_age_verified
    : undefined;
  return {
    id: delivery.id,
    status: delivery.status,
    eta: delivery.dropoff_eta,
    parent_id:
      parentId ?? related.find((r) => r.relationship === "original")?.id,
    return_id: related.find((r) => r.relationship === "returned")?.id,
    ...(passed === undefined ? {} : { verification_passed: passed }),
  };
}
