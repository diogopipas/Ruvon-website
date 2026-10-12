import { commerceCatalog } from "@/lib/server/orders/service";
import { privateJson } from "@/lib/server/commerce-http";
import { apiError } from "@/lib/server/http";
export async function GET() {
  try {
    return privateJson(await commerceCatalog());
  } catch (error) {
    return apiError(error);
  }
}
