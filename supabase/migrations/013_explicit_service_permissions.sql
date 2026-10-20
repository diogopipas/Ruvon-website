-- Supabase's default privileges also grant service_role rights. A GRANT does
-- not narrow those inherited creation defaults. Make the intended ACL explicit.
revoke all on public.payment_orders,public.payment_attempts from public,anon,authenticated,service_role;
grant select,insert,update on public.payment_orders,public.payment_attempts to service_role;

revoke all on public.leads,public.simulated_orders,public.merchant_interests,public.analytics_events from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.leads,public.simulated_orders,public.merchant_interests,public.analytics_events to service_role;

-- Trigger functions are invoked by database triggers, never directly by clients.
revoke all on function public.protect_payment_attempt(),public.protect_payment_snapshot(),public.commerce_protect_operation(),public.commerce_protect_notification(),public.commerce_event_notifications(),public.commerce_merchant_store(uuid) from public,anon,authenticated,service_role;

-- Staff commands use the authenticated JWT identity, not the service key.
revoke all on function public.merchant_command(uuid,uuid,integer,text,text,text,jsonb),public.merchant_heartbeat(uuid),public.merchant_inventory(uuid,text,integer,boolean,integer),public.merchant_set_paused(uuid,boolean),public.merchant_orders(),public.merchant_products(),public.merchant_stores(),public.operations_command(uuid,uuid,integer,text,text,uuid,integer,jsonb),public.operations_resolve_case(uuid,uuid,integer,uuid,jsonb,text) from service_role;
