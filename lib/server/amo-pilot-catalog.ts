import "server-only";
import draft from "@/docs/pilot/amo-draft.json";
import type { AmoPilotProduct } from "@/components/ordering/amo-pilot-catalog";

export function getAmoPilotProducts(): AmoPilotProduct[] {
  return draft.products.map(({ ruvon_sku, name, unit, price_cents }) => ({
    id: ruvon_sku,
    name,
    unit,
    price_cents,
  }));
}
