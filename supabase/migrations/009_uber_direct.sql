create table public.deliveries (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.payment_orders(id),
  direction text not null check(direction in ('outbound','return')), parent_delivery_id uuid references public.deliveries(id),
  operation_id uuid unique references public.provider_operations(id), provider_delivery_id text not null,
  provider_account text not null, environment text not null check(environment in ('sandbox','live')),
  provider_quote_id text, raw_status text not null, status text not null check(status in ('pending','pickup','pickup_complete','dropoff','delivered','canceled','returned','unknown')),
  tracking_url text, quoted_cost integer check(quoted_cost>=0), actual_cost integer check(actual_cost>=0), return_cost integer check(return_cost>=0),
  eta timestamptz, picked_up_at timestamptz, delivered_at timestamptz, returned_at timestamptz,
  verification_passed boolean, verification_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider_account,environment,provider_delivery_id),
  check((direction='outbound' and parent_delivery_id is null) or (direction='return' and parent_delivery_id is not null))
);
create unique index one_outbound_delivery on public.deliveries(order_id) where direction='outbound';
create index delivery_active on public.deliveries(status,updated_at) where status not in ('delivered','returned');
create index delivery_order on public.deliveries(order_id);
alter table public.deliveries enable row level security;
revoke all on public.deliveries from public,anon,authenticated,service_role;
grant select on public.deliveries to service_role;
