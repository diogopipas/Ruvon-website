-- All money values are integer euro cents. The catalog is authoritative on the server.
create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null unique,
  email text,
  phone text,
  city text not null,
  postcode text not null check (postcode ~ '^\d{4}-\d{3}$'),
  basket_total integer not null default 0 check (basket_total >= 0),
  basket_items jsonb not null default '[]'::jsonb,
  consent_at timestamptz not null,
  utm_source text, utm_medium text, utm_campaign text, utm_content text,
  check ((email is not null) <> (phone is not null))
);
create table if not exists public.simulated_orders (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  session_id uuid not null unique,
  city text not null default '',
  postcode text not null default '',
  items jsonb not null default '[]'::jsonb,
  subtotal integer not null check (subtotal >= 0),
  delivery_fee integer not null check (delivery_fee >= 0),
  service_fee integer not null check (service_fee >= 0),
  total integer not null check (total = subtotal + delivery_fee + service_fee),
  converted_to_lead boolean not null default false,
  reached_checkout boolean not null default false,
  utm_source text, utm_medium text, utm_campaign text, utm_content text
);
create table if not exists public.merchant_interests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  store_name text not null,
  city text not null,
  contact_name text not null,
  contact text not null,
  consent_at timestamptz not null
);
create table if not exists public.analytics_events (
  id uuid primary key,
  created_at timestamptz not null default now(),
  session_id uuid not null,
  name text not null check (name in ('landing_view','order_cta_clicked','category_clicked','product_viewed','product_added','product_removed','cart_opened','checkout_started','location_entered','waitlist_submitted','share_clicked')),
  properties jsonb not null default '{}'::jsonb
);

create index if not exists leads_city_postcode_idx on public.leads (city, postcode);
create index if not exists leads_campaign_idx on public.leads (utm_campaign, utm_source);
create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists orders_created_idx on public.simulated_orders (created_at desc);
create index if not exists orders_city_postcode_idx on public.simulated_orders (city, postcode);
create index if not exists orders_checkout_idx on public.simulated_orders (reached_checkout) where reached_checkout;
create index if not exists events_name_session_idx on public.analytics_events (name, session_id);
create index if not exists events_created_idx on public.analytics_events (created_at desc);
create index if not exists merchants_city_idx on public.merchant_interests (city);

-- No public policies: the browser cannot read or write these tables.
alter table public.leads enable row level security;
alter table public.simulated_orders enable row level security;
alter table public.merchant_interests enable row level security;
alter table public.analytics_events enable row level security;
revoke all on public.leads, public.simulated_orders, public.merchant_interests, public.analytics_events from anon, authenticated;
grant select, insert, update, delete on public.leads, public.simulated_orders, public.merchant_interests, public.analytics_events to service_role;

create or replace function public.save_simulated_order(order_data jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare incoming public.simulated_orders;
begin
  incoming := jsonb_populate_record(null::public.simulated_orders, order_data);
  if jsonb_array_length(incoming.items) = 0 and not exists (
    select 1 from public.simulated_orders where session_id = incoming.session_id
  ) then return; end if;
  insert into public.simulated_orders select (incoming).*
  on conflict (session_id) do update set
    updated_at = excluded.updated_at,
    city = coalesce(nullif(excluded.city, ''), public.simulated_orders.city),
    postcode = coalesce(nullif(excluded.postcode, ''), public.simulated_orders.postcode),
    items = excluded.items,
    subtotal = excluded.subtotal,
    delivery_fee = excluded.delivery_fee,
    service_fee = excluded.service_fee,
    total = excluded.total,
    reached_checkout = public.simulated_orders.reached_checkout or excluded.reached_checkout,
    utm_source = coalesce(excluded.utm_source, public.simulated_orders.utm_source),
    utm_medium = coalesce(excluded.utm_medium, public.simulated_orders.utm_medium),
    utm_campaign = coalesce(excluded.utm_campaign, public.simulated_orders.utm_campaign),
    utm_content = coalesce(excluded.utm_content, public.simulated_orders.utm_content);
end;
$$;

-- One transaction: a saved lead can never be separated from its basket.
-- Retry-safe: a session produces one lead and one simulated order.
create or replace function public.capture_lead(lead_data jsonb, order_data jsonb default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare incoming public.leads;
begin
  incoming := jsonb_populate_record(null::public.leads, lead_data);
  if order_data is not null then
    if (order_data->>'session_id')::uuid <> incoming.session_id then
      raise exception 'Session mismatch';
    end if;
    perform public.save_simulated_order(order_data);
    update public.simulated_orders set converted_to_lead = true where session_id = incoming.session_id;
  end if;
  insert into public.leads select (incoming).*
  on conflict (session_id) do update set
    email = excluded.email, phone = excluded.phone,
    city = excluded.city, postcode = excluded.postcode,
    basket_total = excluded.basket_total, basket_items = excluded.basket_items,
    consent_at = excluded.consent_at,
    utm_source = excluded.utm_source, utm_medium = excluded.utm_medium,
    utm_campaign = excluded.utm_campaign, utm_content = excluded.utm_content;
end;
$$;
revoke all on function public.save_simulated_order(jsonb) from public, anon, authenticated;
revoke all on function public.capture_lead(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_simulated_order(jsonb) to service_role;
grant execute on function public.capture_lead(jsonb, jsonb) to service_role;
