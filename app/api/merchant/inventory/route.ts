import { z } from "zod";
import { merchantRpc } from "@/lib/server/merchant/service";
import { commerceInput, privateJson } from "@/lib/server/commerce-http";
import { staffSession } from "@/lib/server/merchant/auth";
import { apiError } from "@/lib/server/http";
const schema = z
  .object({
    store_id: z.uuid(),
    sku: z.string().min(1).max(100),
    quantity: z.number().int().nonnegative(),
    enabled: z.boolean(),
    expected_version: z.number().int().nonnegative(),
  })
  .strict();
export async function GET() {
  try {
    return privateJson(await merchantRpc("merchant_products"));
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { user } = await staffSession(),
      input = await commerceInput(request, schema, user.id);
    return privateJson(
      await merchantRpc("merchant_inventory", {
        p_store: input.store_id,
        p_sku: input.sku,
        p_quantity: input.quantity,
        p_enabled: input.enabled,
        p_version: input.expected_version,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
