-- Additive: flow 1 remains the isolated Single Sale sandbox contract.
create table public.stores (
  id uuid primary key default gen_random_uuid(), name text not null,
  enabled boolean not null default false, paused boolean not null default true,
  pickup_address jsonb not null check (jsonb_typeof(pickup_address) = 'object'),
  phone text not null, email text not null, timezone text not null default 'Europe/Lisbon' check (timezone = 'Europe/Lisbon'),
  opening_hours jsonb not null default '{}' check (jsonb_typeof(opening_hours) = 'object'),
  delivery_postcodes text[] not null default '{}',
  commission_bps integer not null default 1000 check (commission_bps between 0 and 10000),
  service_fee integer not null default 200 check (service_fee >= 0),
  preparation_minutes integer not null default 10 check (preparation_minutes between 1 and 120),
  heartbeat_at timestamptz, easypay_account_id uuid, uber_store_reference text,
  clearing_period text check(clearing_period ~ '^([7-9]|[1-9][0-9]{1,2})D$'), release_delay_days integer check(release_delay_days between 1 and 365),
  pause_reason text, created_at timestamptz not null default now()
);
create index stores_enabled on public.stores(id) where enabled and not paused;
create table public.store_users (
  store_id uuid not null references public.stores(id), user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','staff')), active boolean not null default true,
  primary key(store_id,user_id)
);
create index store_users_user on public.store_users(user_id) where active;
create table public.catalog_skus (
  sku text primary key, name text not null, unit text not null,
  contains_alcohol boolean not null, requires_age_verification boolean not null,
  weight_grams integer not null check(weight_grams > 0), dimensions jsonb not null,
  enabled boolean not null default false,
  check (not contains_alcohol or requires_age_verification)
);
create table public.store_products (
  store_id uuid not null references public.stores(id), sku text not null references public.catalog_skus(sku),
  price integer not null check(price >= 0), enabled boolean not null default false,
  stock_on_hand integer not null default 0 check(stock_on_hand >= 0),
  reserved_quantity integer not null default 0 check(reserved_quantity between 0 and stock_on_hand),
  version integer not null default 0, primary key(store_id,sku)
);
create index store_products_available on public.store_products(store_id,sku) where enabled;
alter table public.payment_orders drop constraint payment_orders_environment_check;
alter table public.payment_orders add constraint payment_orders_environment_check check(environment in ('sandbox','live'));
alter table public.payment_orders
  add column flow_version integer not null default 1 check(flow_version in (1,2)),
  add column store_id uuid references public.stores(id),
  add column operational_status text not null default 'awaiting_payment' check(operational_status in ('awaiting_payment','awaiting_merchant','confirming','preparing','ready_for_pickup','in_delivery','delivered','completed','cancelling','cancelled','returning','returned','manual_review')),
  add column version integer not null default 0 check(version >= 0),
  add column payment_status text not null default 'not_started' check(payment_status in ('not_started','authorisation_pending','authorised','capture_pending','paid','void_pending','voided','failed','expired','unknown')),
  add column merchant_status text not null default 'not_requested' check(merchant_status in ('not_requested','pending','accepted','preparing','ready','rejected','timed_out')),
  add column settlement_status text not null default 'held' check(settlement_status in ('held','release_pending','scheduled','released','bank_settlement_pending','settled','failed','disputed')),
  add column recipient_name text, add column recipient_phone text, add column recipient_email text,
  add column delivery_address jsonb, add column quote_snapshot jsonb, add column quote_expires_at timestamptz,
  add column acceptance_deadline timestamptz, add column reservation_expires_at timestamptz,
  add column cancellation_reason text, add column review_reason text, add column review_previous_status text,
  add column allocation jsonb, add column contains_alcohol boolean not null default false,
  add column requires_age_verification boolean not null default false,
  add column accepted_at timestamptz, add column ready_at timestamptz, add column picked_up_at timestamptz,
  add column delivered_at timestamptz, add column cancelled_at timestamptz, add column completed_at timestamptz,
  add column terms_confirmed_at timestamptz,
  add constraint commerce_snapshot_required check(flow_version = 1 or (store_id is not null and delivery_address is not null and quote_snapshot is not null and quote_expires_at is not null and allocation is not null));
create index commerce_store_status on public.payment_orders(store_id,operational_status,created_at) where flow_version=2;
create index commerce_deadline on public.payment_orders(acceptance_deadline) where operational_status='awaiting_merchant' and flow_version=2;
create index commerce_review on public.payment_orders(created_at) where operational_status='manual_review' and flow_version=2;
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.payment_orders(id),
  line_number integer not null check(line_number > 0), catalog_id text not null, name text not null,
  options jsonb not null default '{}', quantity integer not null check(quantity between 1 and 30),
  unit_price integer not null check(unit_price >= 0), line_price integer not null check(line_price = unit_price * quantity),
  recipe jsonb not null check(jsonb_typeof(recipe)='array' and jsonb_array_length(recipe)>0),
  components jsonb not null, unique(order_id,line_number)
);
create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.payment_orders(id),
  store_id uuid not null, sku text not null, quantity integer not null check(quantity > 0),
  status text not null default 'reserved' check(status in ('reserved','consumed','released','restocked')),
  expires_at timestamptz not null, foreign key(store_id,sku) references public.store_products(store_id,sku), unique(order_id,sku)
);
create index inventory_due on public.inventory_reservations(expires_at) where status='reserved';
create table public.order_events (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.payment_orders(id),
  sequence integer not null, command_key text not null unique, command_hash text not null,
  actor_type text not null check(actor_type in ('customer','merchant','admin','worker','provider')),
  actor_id text not null, before_state text not null, after_state text not null,
  reason text, metadata jsonb not null default '{}', outcome jsonb not null,
  created_at timestamptz not null default now(), unique(order_id,sequence)
);
create index order_events_timeline on public.order_events(order_id,created_at);
create table public.background_jobs (
  id uuid primary key default gen_random_uuid(), kind text not null, order_id uuid references public.payment_orders(id),
  reference_id uuid, job_key text not null unique, payload jsonb not null default '{}', payload_version integer not null default 1,
  state text not null default 'pending' check(state in ('pending','running','succeeded','failed')),
  due_at timestamptz not null default now(), attempts integer not null default 0,
  lease_token uuid, lease_expires_at timestamptz, last_error text, created_at timestamptz not null default now(), completed_at timestamptz
);
create index jobs_due on public.background_jobs(due_at) where state='pending';
create index jobs_expired on public.background_jobs(lease_expires_at) where state='running';
create table public.external_events (
  id uuid primary key default gen_random_uuid(), provider text not null check(provider in ('easypay','uber','resend','twilio')),
  account text not null, environment text not null check(environment in ('sandbox','live')),
  event_identity text not null, resource_id text, provider_time timestamptz,
  payload_hash text not null, payload jsonb not null, verified boolean not null check(verified),
  state text not null default 'pending' check(state in ('pending','processed','quarantined')),
  processing_error text, received_at timestamptz not null default now(), processed_at timestamptz,
  unique(provider,account,environment,event_identity)
);
create index external_pending on public.external_events(received_at) where state='pending';
create index external_resource on public.external_events(provider,account,environment,resource_id);
create table public.commerce_rate_limits (key text primary key, count integer not null, expires_at timestamptz not null);

-- Explicit snapshot protection; a paid capture remains paid as fulfilment evolves.
create or replace function public.protect_payment_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
  if old.flow_version=1 then
    if (to_jsonb(new)-array['state','current_attempt_id','paid_at']) is distinct from (to_jsonb(old)-array['state','current_attempt_id','paid_at']) then raise exception 'Payment snapshot is immutable'; end if;
  else
    if current_setting('ruvon.command',true) is distinct from 'on' then raise exception 'Guarded command required'; end if;
    if (to_jsonb(new)-array['state','current_attempt_id','paid_at','operational_status','version','payment_status','merchant_status','settlement_status','recipient_name','recipient_phone','recipient_email','acceptance_deadline','reservation_expires_at','cancellation_reason','review_reason','review_previous_status','accepted_at','ready_at','picked_up_at','delivered_at','cancelled_at','completed_at','terms_confirmed_at']) is distinct from (to_jsonb(old)-array['state','current_attempt_id','paid_at','operational_status','version','payment_status','merchant_status','settlement_status','recipient_name','recipient_phone','recipient_email','acceptance_deadline','reservation_expires_at','cancellation_reason','review_reason','review_previous_status','accepted_at','ready_at','picked_up_at','delivered_at','cancelled_at','completed_at','terms_confirmed_at']) then raise exception 'Commerce snapshot is immutable'; end if;
    if old.current_attempt_id is not null and (new.recipient_name,new.recipient_phone,new.recipient_email,new.terms_confirmed_at) is distinct from (old.recipient_name,old.recipient_phone,old.recipient_email,old.terms_confirmed_at) then raise exception 'Contact is immutable after payment starts'; end if;
  end if;
  if old.state='paid' and new.state<>'paid' then raise exception 'Paid capture is immutable'; end if;
  return new;
end $$;
create function public.commerce_append_event(p_order uuid,p_key text,p_hash text,p_actor text,p_actor_id text,p_before text,p_reason text default null,p_metadata jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; outcome jsonb; n integer;
begin
  select * into strict o from public.payment_orders where id=p_order for update;
  select coalesce(max(sequence),0)+1 into n from public.order_events where order_id=p_order;
  outcome:=jsonb_build_object('id',o.id,'version',o.version,'operational_status',o.operational_status,'payment_status',o.payment_status);
  insert into public.order_events(order_id,sequence,command_key,command_hash,actor_type,actor_id,before_state,after_state,reason,metadata,outcome) values(p_order,n,p_key,p_hash,p_actor,p_actor_id,p_before,o.operational_status,p_reason,p_metadata,outcome);
  return outcome;
end $$;
create function public.commerce_enqueue(p_kind text,p_order uuid,p_key text,p_due timestamptz default now(),p_payload jsonb default '{}',p_reference uuid default null) returns void language sql security definer set search_path='' as $$
  insert into public.background_jobs(kind,order_id,job_key,due_at,payload,reference_id) values(p_kind,p_order,p_key,p_due,p_payload,p_reference) on conflict(job_key) do nothing;
$$;
create function public.commerce_inventory(p_order uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare r public.inventory_reservations;
begin
  if p_action not in ('release','consume') then raise exception 'Invalid inventory action'; end if;
  for r in select * from public.inventory_reservations where order_id=p_order and status='reserved' order by sku for update loop
    update public.store_products set reserved_quantity=reserved_quantity-r.quantity,stock_on_hand=stock_on_hand-case when p_action='consume' then r.quantity else 0 end,version=version+1 where store_id=r.store_id and sku=r.sku;
    update public.inventory_reservations set status=case when p_action='consume' then 'consumed' else 'released' end where id=r.id;
  end loop;
end $$;
create function public.commerce_store_open(p_store uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare s public.stores; local_time timestamp; d integer; m text; span jsonb;
begin
  select * into strict s from public.stores where id=p_store;
  local_time:=now() at time zone s.timezone; d:=extract(dow from local_time); m:=to_char(local_time,'HH24:MI');
  for span in select value from jsonb_array_elements(coalesce(s.opening_hours->d::text,'[]'::jsonb)) loop
    if ((span->>'start') < (span->>'end') and m >= (span->>'start') and m < (span->>'end')) or ((span->>'start') > (span->>'end') and m >= (span->>'start')) then return true; end if;
  end loop;
  for span in select value from jsonb_array_elements(coalesce(s.opening_hours->((d+6)%7)::text,'[]'::jsonb)) loop
    if (span->>'start') > (span->>'end') and m < (span->>'end') then return true; end if;
  end loop;
  return false;
end $$;
create function public.commerce_create_quote(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; s public.stores; line jsonb; part jsonb; product public.store_products; n integer:=0; sum_lines bigint:=0; unit_total bigint;
begin
  -- Serialize owner/key creation, including retries whose original response was lost.
  perform pg_advisory_xact_lock(hashtextextended((p_data->>'owner_hash') || (p_data->>'checkout_key'),0));
  select * into o from public.payment_orders where owner_hash=p_data->>'owner_hash' and checkout_key=(p_data->>'checkout_key')::uuid;
  if found then
    if o.flow_version<>2 or o.snapshot_hash<>p_data->>'snapshot_hash' then raise exception 'Checkout changed' using errcode='23505'; end if;
    return to_jsonb(o);
  end if;
  select * into strict s from public.stores where id=(p_data->>'store_id')::uuid for share;
  if not s.enabled or s.paused or s.heartbeat_at is null or s.heartbeat_at < now()-interval '90 seconds' or not public.commerce_store_open(s.id) or not ((p_data->'delivery_address'->>'zip_code')=any(s.delivery_postcodes)) then raise exception 'Store unavailable' using errcode='P0001'; end if;
  if (p_data->>'quote_expires_at')::timestamptz <= now() then raise exception 'Quote expired'; end if;
  -- Validate the server snapshot against current store prices inside the transaction.
  for line in select value from jsonb_array_elements(p_data->'items') loop
    unit_total:=0;
    for part in select value from jsonb_array_elements(line->'components') loop
      select * into strict product from public.store_products where store_id=s.id and sku=part->>'sku' for share;
      if not product.enabled or product.price<>(part->>'unit_price')::integer or (part->>'quantity')::integer<=0 then raise exception 'Price changed'; end if;
      unit_total:=unit_total+product.price*(part->>'quantity')::integer;
    end loop;
    if unit_total<>(line->>'unit_price')::integer or unit_total*(line->>'quantity')::integer<>(line->>'line_price')::integer or jsonb_array_length(line->'recipe')=0 then raise exception 'Invalid price snapshot'; end if;
    sum_lines:=sum_lines+(line->>'line_price')::integer;
  end loop;
  if sum_lines<>(p_data->>'subtotal')::integer or (p_data->>'service_fee')::integer<>s.service_fee or (p_data->'allocation'->>'commission_bps')::integer<>s.commission_bps or (p_data->'allocation'->>'merchant')::integer+(p_data->'allocation'->>'ruvon')::integer<>(p_data->>'total')::integer then raise exception 'Invalid allocation'; end if;
  insert into public.payment_orders(owner_hash,checkout_key,snapshot_hash,city,items,subtotal,delivery_fee,service_fee,total,environment,flow_version,store_id,delivery_address,quote_snapshot,quote_expires_at,allocation,contains_alcohol,requires_age_verification)
  values(p_data->>'owner_hash',(p_data->>'checkout_key')::uuid,p_data->>'snapshot_hash',p_data->'delivery_address'->>'city',p_data->'items',(p_data->>'subtotal')::integer,(p_data->>'delivery_fee')::integer,(p_data->>'service_fee')::integer,(p_data->>'total')::integer,p_data->>'environment',2,s.id,p_data->'delivery_address',p_data->'quote_snapshot',(p_data->>'quote_expires_at')::timestamptz,p_data->'allocation',(p_data->>'contains_alcohol')::boolean,(p_data->>'requires_age_verification')::boolean) returning * into o;
  for line in select value from jsonb_array_elements(o.items) loop
    n:=n+1;
    insert into public.order_items(order_id,line_number,catalog_id,name,options,quantity,unit_price,line_price,recipe,components) values(o.id,n,line->>'id',line->>'name',coalesce(line->'options','{}'),(line->>'quantity')::integer,(line->>'unit_price')::integer,(line->>'line_price')::integer,line->'recipe',line->'components');
  end loop;
  perform public.commerce_append_event(o.id,'quote:'||o.id,o.snapshot_hash,'customer',o.owner_hash,o.operational_status);
  return to_jsonb(o);
end $$;
create function public.commerce_claim_jobs(p_limit integer default 10) returns setof public.background_jobs language sql security definer set search_path='' as $$
  with due as (select id from public.background_jobs where (state='pending' and due_at<=now()) or (state='running' and lease_expires_at<=now()) order by due_at,id for update skip locked limit least(greatest(p_limit,1),10))
  update public.background_jobs j set state='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds' from due where j.id=due.id returning j.*;
$$;
create function public.commerce_finish_job(p_id uuid,p_token uuid,p_error text default null,p_retry_at timestamptz default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.background_jobs set state=case when p_error is null then 'succeeded' when p_retry_at is null then 'failed' else 'pending' end,last_error=p_error,due_at=coalesce(p_retry_at,due_at),lease_token=null,lease_expires_at=null,completed_at=case when p_error is null then now() else null end where id=p_id and state='running' and lease_token=p_token and lease_expires_at>now();
  return found;
end $$;
create function public.commerce_ingest_event(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
  insert into public.external_events(provider,account,environment,event_identity,resource_id,payload_hash,payload,verified,provider_time) values(p_data->>'provider',p_data->>'account',p_data->>'environment',p_data->>'event_identity',p_data->>'resource_id',p_data->>'payload_hash',p_data->'payload',true,(p_data->>'provider_time')::timestamptz) on conflict(provider,account,environment,event_identity) do nothing returning id into eid;
  if eid is null then select id into eid from public.external_events where provider=p_data->>'provider' and account=p_data->>'account' and environment=p_data->>'environment' and event_identity=p_data->>'event_identity'; end if;
  perform public.commerce_enqueue('external_event',null,'inbox:'||eid,now(),'{}',eid);
  return eid;
end $$;
create function public.commerce_rate_limit(p_keys text[],p_limit integer default 20) returns boolean language plpgsql security definer set search_path='' as $$
declare k text; n integer;
begin
  delete from public.commerce_rate_limits where expires_at<now();
  foreach k in array p_keys loop
    insert into public.commerce_rate_limits(key,count,expires_at) values(k,1,now()+interval '1 minute') on conflict(key) do update set count=public.commerce_rate_limits.count+1 returning count into n;
    if n>p_limit then return false; end if;
  end loop;
  return true;
end $$;
-- Append-only commercial and audit records, including service-role access.
create function public.commerce_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Immutable history'; end $$;
create trigger order_events_immutable before update or delete on public.order_events for each row execute function public.commerce_immutable();
create trigger order_items_immutable before update or delete on public.order_items for each row execute function public.commerce_immutable();
do $$ declare t text; f record; begin
  foreach t in array array['stores','store_users','catalog_skus','store_products','inventory_reservations','order_items','order_events','background_jobs','external_events','commerce_rate_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'commerce_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
grant execute on function public.commerce_create_quote(jsonb),public.commerce_claim_jobs(integer),public.commerce_finish_job(uuid,uuid,text,timestamptz),public.commerce_ingest_event(jsonb),public.commerce_rate_limit(text[],integer) to service_role;
