import { z } from "zod";
import { merchantRpc } from "@/lib/server/merchant/service";
import { commerceInput, privateJson } from "@/lib/server/commerce-http";
import { staffSession } from "@/lib/server/merchant/auth";
import { apiError } from "@/lib/server/http";
const schema = z
  .object({ store_id: z.uuid(), paused: z.boolean().optional() })
  .strict();
export async function POST(request: Request) {
  try {
    const { user } = await staffSession(),
      input = await commerceInput(request, schema, user.id);
    if (input.paused !== undefined)
      await merchantRpc("merchant_set_paused", {
        p_store: input.store_id,
        p_paused: input.paused,
      });
    await merchantRpc("merchant_heartbeat", { p_store: input.store_id });
    return privateJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
