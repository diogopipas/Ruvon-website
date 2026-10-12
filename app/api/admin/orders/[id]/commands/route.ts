import { z } from "zod";
import { adminCommand } from "@/lib/server/operations/service";
import { commerceInput, privateJson } from "@/lib/server/commerce-http";
import { staffSession } from "@/lib/server/merchant/auth";
import { apiError } from "@/lib/server/http";
const schema = z
  .object({
    command_id: z.uuid(),
    expected_version: z.number().int().nonnegative(),
    command: z.enum(["retry", "cancel", "refund", "acknowledge", "resolve"]),
    reason: z.string().trim().min(3).max(400),
    reference_id: z.uuid().optional(),
    amount: z.number().int().positive().optional(),
    allocation: z
      .object({
        products: z.number().int().nonnegative(),
        service: z.number().int().nonnegative(),
        delivery: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    confirmed: z.literal(true),
    resolution: z
      .object({
        action: z.enum(["resume", "cancel", "record_only"]),
        responsible_party: z.enum([
          "unknown",
          "merchant",
          "ruvon",
          "delivery_provider",
          "customer",
        ]),
        summary: z.string().trim().min(3).max(400),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.command !== "refund" || (!!input.amount && !!input.allocation),
    "Indica o valor e a distribuição do reembolso.",
  )
  .refine(
    (input) =>
      !["retry", "acknowledge", "resolve"].includes(input.command) ||
      !!input.reference_id,
    "Indica a operação ou o caso.",
  )
  .refine(
    (input) => input.command !== "resolve" || !!input.resolution,
    "Indica a resolução aprovada.",
  );
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await staffSession(true),
      input = await commerceInput(request, schema, user.id);
    if (input.command === "resolve")
      return privateJson(
        await adminCommand(
          {
            p_order: z.uuid().parse((await context.params).id),
            p_command: input.command_id,
            p_version: input.expected_version,
            p_reference: input.reference_id,
            p_resolution: input.resolution,
            p_reason: input.reason,
          },
          "operations_resolve_case",
        ),
        202,
      );
    return privateJson(
      await adminCommand({
        p_order: z.uuid().parse((await context.params).id),
        p_command: input.command_id,
        p_version: input.expected_version,
        p_action: input.command,
        p_reason: input.reason,
        p_reference: input.reference_id ?? null,
        p_amount: input.amount ?? null,
        p_allocation: input.allocation ?? {},
      }),
      202,
    );
  } catch (error) {
    return apiError(error);
  }
}
