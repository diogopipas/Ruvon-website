/** Safe operations DTO. No contact details, requests, callback bodies or keys. */
export type OperationsMonitor = {
  checked_at: string;
  configuration: {
    environment: "sandbox" | "live";
    checkout_exposed: boolean;
    easypay: boolean;
    uber: boolean;
    email: boolean;
  };
  worker: {
    last_started_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
    jobs_processed: number;
    healthy: boolean | null;
  } | null;
  stores: {
    id: string;
    name: string;
    enabled: boolean;
    paused: boolean;
    pause_reason: string | null;
    operations_version: number;
    heartbeat_at: string | null;
    connected: boolean;
  }[];
  jobs: {
    id: string;
    order_id: string | null;
    kind: string;
    state: string;
    attempts: number;
    due_at: string;
    lease_expires_at: string | null;
    last_error: string | null;
    can_retry: boolean;
  }[];
  events: {
    id: string;
    provider: string;
    event_identity: string;
    resource_id: string | null;
    state: string;
    processing_error: string | null;
    received_at: string;
    processed_at: string | null;
  }[];
  operations: {
    id: string;
    order_id: string;
    provider: string;
    kind: string;
    status: string;
    provider_resource_id: string | null;
    error_class: string | null;
    created_at: string;
  }[];
  notifications: {
    id: string;
    order_id: string | null;
    channel: string;
    purpose: string;
    status: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
  }[];
  capabilities: { capability: string; expires_at: string; verified: boolean }[];
  audit: {
    command_id: string;
    actor_id: string;
    action: string;
    target_id: string;
    reason: string;
    created_at: string;
  }[];
};

export type OperationsControl = {
  command_id: string;
  action: "pause_store" | "resume_store" | "retry_event";
  target_id: string;
  expected_version: number;
  reason: string;
};
