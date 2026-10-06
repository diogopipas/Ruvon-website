-- Apply to the separate sandbox project. No payment data enters simulated_orders/leads.
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null check (owner_hash ~ '^[0-9a-f]{64}$'),
  checkout_key uuid not null,
  snapshot_hash text not null,
  created_at timestamptz not null default now(),
  city text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  subtotal integer not null check (subtotal > 0),
  delivery_fee integer not null check (delivery_fee >= 0),
  service_fee integer not null check (service_fee >= 0),
  total integer not null check (total = subtotal + delivery_fee + service_fee),
  currency text not null default 'EUR' check (currency = 'EUR'),
  environment text not null default 'sandbox' check (environment = 'sandbox'),
  age_confirmed_at timestamptz not null default now(),
  state text not null default 'draft' check (state in ('draft','creating','pending','reconciling','paid','failed','expired')),
  current_attempt_id uuid,
  paid_at timestamptz,
  unique (owner_hash, checkout_key)
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.payment_orders(id),
  created_at timestamptz not null default now(),
  phone text not null check (phone ~ '^9[1236][0-9]{7}$'),
  email text,
  state text not null default 'creating' check (state in ('creating','pending','reconciling','paid','failed','expired')),
  provider_id uuid unique,
  last_checked_at timestamptz,
  expires_at timestamptz,
  paid_at timestamptz
);
create unique index if not exists one_active_mbway_attempt on public.payment_attempts(order_id)
  where state in ('creating','pending','reconciling');

alter table public.payment_orders enable row level security;
alter table public.payment_attempts enable row level security;
revoke all on public.payment_orders, public.payment_attempts from public, anon, authenticated;
grant select, insert, update on public.payment_orders, public.payment_attempts to service_role;

-- Even privileged writes cannot change the quote/contact underlying an attempt.
create or replace function public.protect_payment_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['state','current_attempt_id','paid_at'])
    is distinct from (to_jsonb(old) - array['state','current_attempt_id','paid_at']) then
    raise exception 'immutable_payment_snapshot';
  end if;
  if old.state = 'paid' and new.state <> 'paid' then raise exception 'paid_state_is_final'; end if;
  return new;
end;
$$;
create trigger protect_payment_order before update on public.payment_orders
  for each row execute function public.protect_payment_snapshot();

create or replace function public.protect_payment_attempt() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['state','provider_id','last_checked_at','expires_at','paid_at'])
    is distinct from (to_jsonb(old) - array['state','provider_id','last_checked_at','expires_at','paid_at']) then
    raise exception 'immutable_payment_attempt';
  end if;
  if old.provider_id is not null and new.provider_id is distinct from old.provider_id then raise exception 'provider_id_mismatch'; end if;
  if old.state='paid' and new.state<>'paid' then raise exception 'paid_state_is_final'; end if;
  return new;
end;
$$;
create trigger protect_mbway_attempt before update on public.payment_attempts
  for each row execute function public.protect_payment_attempt();

create or replace function public.create_payment_order(p_data jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.payment_orders;
begin
  insert into public.payment_orders(owner_hash, checkout_key, snapshot_hash, city, items, subtotal, delivery_fee, service_fee, total)
  values (p_data->>'owner_hash', (p_data->>'checkout_key')::uuid, p_data->>'snapshot_hash', p_data->>'city', p_data->'items',
    (p_data->>'subtotal')::integer, (p_data->>'delivery_fee')::integer, (p_data->>'service_fee')::integer, (p_data->>'total')::integer)
  on conflict (owner_hash, checkout_key) do nothing returning * into o;
  if o.id is null then
    select * into o from public.payment_orders where owner_hash=p_data->>'owner_hash' and checkout_key=(p_data->>'checkout_key')::uuid;
    if o.snapshot_hash <> p_data->>'snapshot_hash' then raise exception 'quote_conflict' using errcode='23505'; end if;
  end if;
  return to_jsonb(o);
end;
$$;

create or replace function public.start_mbway_attempt(p_order_id uuid, p_owner_hash text, p_phone text, p_email text, p_retry boolean default false) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.payment_orders; a public.payment_attempts;
begin
  select * into o from public.payment_orders where id=p_order_id and owner_hash=p_owner_hash for update;
  if o.id is null then raise exception 'order_not_found' using errcode='P0002'; end if;
  if o.current_attempt_id is not null then
    select * into a from public.payment_attempts where id=o.current_attempt_id;
    if o.state='paid' or a.state in ('creating','pending','reconciling','paid') or not p_retry then
      return jsonb_build_object('attempt',to_jsonb(a),'should_create',false);
    end if;
  end if;
  insert into public.payment_attempts(order_id,phone,email) values(o.id,p_phone,nullif(p_email,'')) returning * into a;
  update public.payment_orders set current_attempt_id=a.id,state='creating' where id=o.id;
  return jsonb_build_object('attempt',to_jsonb(a),'should_create',true);
end;
$$;

create or replace function public.settle_mbway_attempt(p_attempt_id uuid, p_provider_id uuid, p_state text, p_expires_at timestamptz default null) returns jsonb
language plpgsql set search_path = '' as $$
declare a public.payment_attempts; o public.payment_orders;
begin
  select * into a from public.payment_attempts where id=p_attempt_id;
  if a.id is null then raise exception 'attempt_not_found'; end if;
  -- All payment mutations lock order before attempt, including concurrent retries.
  select * into o from public.payment_orders where id=a.order_id for update;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if a.provider_id is not null and p_provider_id is not null and a.provider_id <> p_provider_id then raise exception 'provider_id_mismatch'; end if;
  if p_state not in ('pending','reconciling','paid','failed','expired') then raise exception 'invalid_payment_state'; end if;
  if a.state='paid' or (a.state in ('failed','expired') and p_state <> 'paid') then return to_jsonb(a); end if;
  update public.payment_attempts set provider_id=coalesce(provider_id,p_provider_id), state=p_state,
    last_checked_at=now(), expires_at=coalesce(p_expires_at,expires_at),
    paid_at=case when p_state='paid' then coalesce(paid_at,now()) else paid_at end
    where id=a.id returning * into a;
  if o.state <> 'paid' and (o.current_attempt_id=a.id or p_state='paid') then
    update public.payment_orders set state=p_state,
      paid_at=case when p_state='paid' then coalesce(paid_at,now()) else paid_at end where id=o.id;
  end if;
  return to_jsonb(a);
end;
$$;

-- Distributed polling lease: multiple tabs/functions cannot hammer the provider.
create or replace function public.claim_mbway_check(p_attempt_id uuid) returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.payment_attempts set last_checked_at=now() where id=p_attempt_id
    and state in ('creating','pending','reconciling')
    and (last_checked_at is null or last_checked_at < now() - interval '10 seconds')
    and (state <> 'creating' or created_at < now() - interval '20 seconds');
  return found;
end;
$$;

revoke all on function public.create_payment_order(jsonb), public.start_mbway_attempt(uuid,text,text,text,boolean),
  public.settle_mbway_attempt(uuid,uuid,text,timestamptz), public.claim_mbway_check(uuid) from public, anon, authenticated;
grant execute on function public.create_payment_order(jsonb), public.start_mbway_attempt(uuid,text,text,text,boolean),
  public.settle_mbway_attempt(uuid,uuid,text,timestamptz), public.claim_mbway_check(uuid) to service_role;
