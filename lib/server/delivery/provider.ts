import type { DeliveryAddress } from "@/lib/commerce";
import type { ProviderFact, ProviderOperation } from "../payments/provider";
export type DeliveryQuote = {
  id: string;
  expires_at: string;
  fee: number;
  eta: string;
  pickup_address: DeliveryAddress;
  dropoff_address: DeliveryAddress;
};
export interface DeliveryProvider {
  quote(
    pickup: DeliveryAddress,
    dropoff: DeliveryAddress,
  ): Promise<DeliveryQuote>;
  mutate(operation: ProviderOperation): Promise<ProviderFact>;
  reconcile(operation: ProviderOperation): Promise<ProviderFact>;
}
