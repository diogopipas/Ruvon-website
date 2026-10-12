import { operationalOrders } from "@/lib/server/operations/service";
import { privateJson } from "@/lib/server/commerce-http";
import { apiError } from "@/lib/server/http";
export async function GET() {
  try {
    return privateJson(await operationalOrders());
  } catch (error) {
    return apiError(error);
  }
}
