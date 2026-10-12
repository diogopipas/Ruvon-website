export type OutcomeState = "succeeded" | "failed" | "pending" | "unknown";
export type ProviderFact = {
  state: OutcomeState;
  resource_id?: string;
  amount?: number;
  expires_at?: string;
  error_class?: string;
  [key: string]: unknown;
};
export type ProviderOperation = {
  id: string;
  provider: "easypay" | "uber";
  account: string;
  environment: "sandbox" | "live";
  kind:
    | "authorise"
    | "capture"
    | "void"
    | "refund"
    | "delivery_create"
    | "delivery_cancel"
    | "split_schedule";
  order_id: string;
  attempt_id: string | null;
  logical_key: string;
  idempotency_key: string;
  request: {
    path: string;
    method: "POST" | "PATCH";
    body: Record<string, unknown>;
    [key: string]: unknown;
  };
  request_hash: string;
  checkout_manifest?: { id: string; session: string; config?: unknown } | null;
  provider_resource_id: string | null;
  status: "created" | "dispatching" | OutcomeState;
  created_at: string;
  retry_safe_until: string | null;
};
export interface PaymentProvider {
  mutate(operation: ProviderOperation): Promise<ProviderFact>;
  reconcile(operation: ProviderOperation): Promise<ProviderFact>;
}
