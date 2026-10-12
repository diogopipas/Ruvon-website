import { merchantRpc } from "@/lib/server/merchant/service";
import { privateJson } from "@/lib/server/commerce-http";
import { apiError } from "@/lib/server/http";
export async function GET() {
  try {
    return privateJson({
      orders: await merchantRpc("merchant_orders"),
      stores: await merchantRpc("merchant_stores"),
    });
  } catch (error) {
    return apiError(error);
  }
}
