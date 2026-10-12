alter table public.payment_attempts
  add column method text not null default 'MBW' check(method in ('MBW','CC')),
  add column payment_status text not null default 'authorisation_pending' check(payment_status in ('authorisation_pending','authorised','capture_pending','paid','void_pending','voided','failed','expired','unknown')),
  add column authorisation_id uuid, add column capture_id uuid,
  add column authorised_cents integer not null default 0 check(authorised_cents>=0),
  add column captured_cents integer not null default 0 check(captured_cents between 0 and authorised_cents),
  add column account text, add column environment text not null default 'sandbox' check(environment in ('sandbox','live')),
  add constraint attempt_order_identity unique(order_id,id);
alter table public.payment_orders add constraint current_attempt_belongs_to_order foreign key(id,current_attempt_id) references public.payment_attempts(order_id,id) deferrable initially deferred;
create unique index authorisation_resource on public.payment_attempts(account,environment,authorisation_id) where authorisation_id is not null;
create unique index capture_resource on public.payment_attempts(account,environment,capture_id) where capture_id is not null;
create table public.provider_operations (
  id uuid primary key default gen_random_uuid(), provider text not null check(provider in ('easypay','uber')),
  account text not null, environment text not null check(environment in ('sandbox','live')), kind text not null check(kind in ('authorise','capture','void','refund','delivery_create','delivery_cancel','split_schedule')),
  order_id uuid not null references public.payment_orders(id), attempt_id uuid references public.payment_attempts(id),
  logical_key text not null unique, idempotency_key uuid not null default gen_random_uuid(),
  request jsonb not null, request_hash text not null, provider_resource_id text,
  status text not null default 'created' check(status in ('created','dispatching','pending','unknown','succeeded','failed')),
  checkout_manifest jsonb, retry_safe_until timestamptz, dispatched_at timestamptz, resolved_at timestamptz,
  error_class text, created_at timestamptz not null default now(),
  unique(provider,account,environment,idempotency_key),
  foreign key(order_id,attempt_id) references public.payment_attempts(order_id,id),
  check(kind not in ('authorise','capture','void','refund') or attempt_id is not null),
  check((provider='uber')=(kind in ('delivery_create','delivery_cancel')))
);
create index operations_pending on public.provider_operations(created_at) where status in ('dispatching','pending','unknown');
create unique index one_attempt_mutation on public.provider_operations(attempt_id,kind) where kind in ('authorise','capture','void');
create unique index one_outbound_booking on public.provider_operations(order_id) where kind='delivery_create';
create table public.payment_splits (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.payment_orders(id),
  attempt_id uuid not null references public.payment_attempts(id), capture_id uuid not null,
  provider_split_id uuid, provider_account_id uuid not null,
  beneficiary text not null check(beneficiary in ('merchant','ruvon')), store_id uuid references public.stores(id),
  amount integer not null check(amount>0), clearing_date date,
  release_state text not null default 'held' check(release_state in ('held','release_pending','scheduled','released','bank_settlement_pending','settled','failed','disputed')),
  release_revision integer not null default 0, settlement_id text, settlement_evidence jsonb,
  unique(capture_id,beneficiary), unique(provider_split_id)
);
create index splits_pending on public.payment_splits(clearing_date) where release_state in ('held','release_pending','scheduled');
create table public.refunds (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.payment_orders(id),
  attempt_id uuid not null references public.payment_attempts(id), operation_id uuid unique references public.provider_operations(id),
  amount integer not null check(amount>0), allocation jsonb not null, reason text not null,
  responsible_party text not null check(responsible_party in ('unknown','merchant','ruvon','delivery_provider','customer')),
  approval_actor text not null, provider_id uuid unique,
  status text not null default 'requested' check(status in ('requested','processing','unknown','succeeded','failed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index refunds_pending on public.refunds(created_at) where status in ('requested','processing','unknown');
create or replace function public.protect_payment_attempt() returns trigger language plpgsql set search_path='' as $$
declare flow integer;
begin
  select flow_version into flow from public.payment_orders where id=old.order_id;
  if flow=2 and current_setting('ruvon.command',true) is distinct from 'on' then raise exception 'Guarded command required'; end if;
  if (to_jsonb(new)-array['state','provider_id','last_checked_at','expires_at','paid_at','payment_status','authorisation_id','capture_id','authorised_cents','captured_cents']) is distinct from (to_jsonb(old)-array['state','provider_id','last_checked_at','expires_at','paid_at','payment_status','authorisation_id','capture_id','authorised_cents','captured_cents']) then raise exception 'Payment attempt is immutable'; end if;
  if old.provider_id is not null and new.provider_id is distinct from old.provider_id then raise exception 'Provider identity is immutable'; end if;
  if old.authorisation_id is not null and new.authorisation_id is distinct from old.authorisation_id then raise exception 'Authorisation identity is immutable'; end if;
  if old.capture_id is not null and new.capture_id is distinct from old.capture_id then raise exception 'Capture identity is immutable'; end if;
  if old.state='paid' and new.state<>'paid' then raise exception 'Paid capture is immutable'; end if;
  if new.captured_cents<old.captured_cents then raise exception 'Capture fact is immutable'; end if;
  return new;
end $$;
-- Existing protect_mbway_attempt trigger now invokes the evolved function.
create function public.commerce_start_order(p_order uuid,p_owner text,p_command uuid,p_contact jsonb,p_method text,p_account text,p_retry boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; a public.payment_attempts; previous public.order_events; h text; r record; product public.store_products; before_state text;
begin
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order and owner_hash=p_owner and flow_version=2 for update;
  h:=md5(jsonb_build_object('contact',p_contact,'method',p_method,'retry',p_retry)::text);
  select * into previous from public.order_events where command_key=p_command::text;
  if found then
    if previous.order_id<>o.id or previous.actor_id<>p_owner or previous.command_hash<>h then raise exception 'Command conflict' using errcode='23505'; end if;
    return previous.outcome;
  end if;
  if o.operational_status<>'awaiting_payment' then raise exception 'Order cannot start' using errcode='40001'; end if;
  if o.current_attempt_id is not null then
    if o.recipient_name is distinct from p_contact->>'name' or o.recipient_phone is distinct from p_contact->>'phone' or o.recipient_email is distinct from nullif(p_contact->>'email','') then raise exception 'Contact snapshot cannot change'; end if;
    select * into strict a from public.payment_attempts where id=o.current_attempt_id;
    if a.payment_status not in ('failed','expired') or not p_retry then return jsonb_build_object('id',o.id,'version',o.version,'operational_status',o.operational_status,'payment_status',o.payment_status); end if;
  end if;
  if o.quote_expires_at<=now() or o.created_at<now()-interval '10 minutes' then raise exception 'Quote expired' using errcode='40001'; end if;
  perform 1 from public.stores where id=o.store_id and enabled and not paused and heartbeat_at>now()-interval '90 seconds' and public.commerce_store_open(id) for update;
  if not found then raise exception 'Store unavailable'; end if;
  -- The store row serializes the pilot limit as well as stock reservations.
  if (select count(*) from public.payment_orders where flow_version=2 and store_id=o.store_id and current_attempt_id is not null and operational_status not in ('completed','cancelled'))>=3 then raise exception 'Pilot capacity reached'; end if;
  for r in select part->>'sku' sku,sum((part->>'quantity')::integer*i.quantity)::integer quantity from public.order_items i cross join lateral jsonb_array_elements(i.recipe) part where i.order_id=o.id group by part->>'sku' order by part->>'sku' loop
    select * into strict product from public.store_products where store_id=o.store_id and sku=r.sku for update;
    if not product.enabled or product.stock_on_hand-product.reserved_quantity<r.quantity then raise exception 'Insufficient inventory'; end if;
    update public.store_products set reserved_quantity=reserved_quantity+r.quantity,version=version+1 where store_id=o.store_id and sku=r.sku;
    insert into public.inventory_reservations(order_id,store_id,sku,quantity,expires_at) values(o.id,o.store_id,r.sku,r.quantity,least(o.quote_expires_at,o.created_at+interval '10 minutes')) on conflict(order_id,sku) do update set status='reserved',expires_at=excluded.expires_at;
  end loop;
  if p_method not in ('MBW','CC') then raise exception 'Invalid method'; end if;
  insert into public.payment_attempts(order_id,phone,email,method,account,environment) values(o.id,p_contact->>'phone',nullif(p_contact->>'email',''),p_method,p_account,o.environment) returning * into a;
  before_state:=o.operational_status;
  update public.payment_orders set current_attempt_id=a.id,state='creating',payment_status='authorisation_pending',recipient_name=coalesce(recipient_name,p_contact->>'name'),recipient_phone=coalesce(recipient_phone,p_contact->>'phone'),recipient_email=coalesce(recipient_email,nullif(p_contact->>'email','')),terms_confirmed_at=coalesce(terms_confirmed_at,now()),reservation_expires_at=least(quote_expires_at,created_at+interval '10 minutes'),version=version+1 where id=o.id;
  perform public.commerce_enqueue('authorise',o.id,'authorise:'||a.id,now(),'{}',a.id);
  perform public.commerce_enqueue('checkout_expiry',o.id,'checkout-expiry:'||a.id,least(o.quote_expires_at,o.created_at+interval '10 minutes'));
  return public.commerce_append_event(o.id,p_command::text,h,'customer',p_owner,before_state);
end $$;
create function public.commerce_prepare_operation(p_data jsonb,p_job uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.provider_operations; o public.payment_orders;
begin
  select * into strict o from public.payment_orders where id=(p_data->>'order_id')::uuid for update;
  perform 1 from public.background_jobs where id=p_job and order_id=o.id and lease_token=p_token and lease_expires_at>now() and state='running' for update;
  if not found then raise exception 'Lease lost' using errcode='40001'; end if;
  select * into op from public.provider_operations where logical_key=p_data->>'logical_key';
  if found then
    if op.order_id<>o.id or op.request_hash<>p_data->>'request_hash' then raise exception 'Operation conflict'; end if;
    return to_jsonb(op);
  end if;
  if p_data->>'kind'='capture' and (o.operational_status<>'confirming' or o.payment_status<>'authorised' or o.review_reason is not null) then raise exception 'Capture prohibited'; end if;
  if p_data->>'kind'='delivery_create' and (o.operational_status<>'confirming' or o.payment_status<>'paid' or o.review_reason is not null) then raise exception 'Booking prohibited'; end if;
  if p_data->>'kind'='authorise' and o.operational_status<>'awaiting_payment' then raise exception 'Authorisation prohibited'; end if;
  if p_data->>'kind'='split_schedule' and (o.operational_status<>'delivered' or o.review_reason is not null or o.settlement_status='disputed') then raise exception 'Clearing prohibited'; end if;
  insert into public.provider_operations(provider,account,environment,kind,order_id,attempt_id,logical_key,idempotency_key,request,request_hash)
  values(p_data->>'provider',p_data->>'account',o.environment,p_data->>'kind',o.id,(p_data->>'attempt_id')::uuid,p_data->>'logical_key',(p_data->>'idempotency_key')::uuid,p_data->'request',p_data->>'request_hash') returning * into op;
  return to_jsonb(op);
end $$;
create function public.commerce_dispatch_operation(p_operation uuid,p_job uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare op public.provider_operations; o public.payment_orders;
begin
  select po.* into strict o from public.payment_orders po join public.provider_operations x on x.order_id=po.id where x.id=p_operation for update of po;
  select * into strict op from public.provider_operations where id=p_operation for update;
  perform 1 from public.background_jobs where id=p_job and order_id=op.order_id and lease_token=p_token and lease_expires_at>now() and state='running' for update;
  if not found then raise exception 'Lease lost' using errcode='40001'; end if;
  if op.status<>'created' then return false; end if;
  if op.kind='capture' and (o.operational_status<>'confirming' or o.payment_status<>'authorised' or o.review_reason is not null) then raise exception 'Capture prohibited'; end if;
  if op.kind='delivery_create' and (o.operational_status<>'confirming' or o.payment_status<>'paid' or o.review_reason is not null) then raise exception 'Booking prohibited'; end if;
  if op.kind='authorise' and o.operational_status<>'awaiting_payment' then raise exception 'Authorisation prohibited'; end if;
  if op.kind='split_schedule' and (o.operational_status<>'delivered' or o.review_reason is not null or o.settlement_status='disputed') then raise exception 'Clearing prohibited'; end if;
  update public.provider_operations set status='dispatching',dispatched_at=now(),retry_safe_until=case when provider='easypay' then now()+interval '24 hours' else null end where id=op.id and status='created';
  return found; -- False always means reconcile. A lease is never permission to resend.
end $$;
create function public.commerce_refund_reserve(p_order uuid,p_id uuid,p_amount integer,p_allocation jsonb,p_reason text,p_actor text,p_party text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; a public.payment_attempts; r public.refunds; reserved bigint;
begin
  select * into strict o from public.payment_orders where id=p_order and flow_version=2 for update;
  select * into r from public.refunds where id=p_id;
  if found then
    if r.order_id<>o.id or r.amount<>p_amount or r.allocation<>p_allocation or r.reason<>p_reason or r.approval_actor<>p_actor then raise exception 'Refund conflict'; end if;
    return to_jsonb(r);
  end if;
  select * into strict a from public.payment_attempts where id=o.current_attempt_id;
  select coalesce(sum(amount),0) into reserved from public.refunds where order_id=o.id and status<>'failed';
  if p_amount<=0 or reserved+p_amount>a.captured_cents then raise exception 'Refund exceeds captured balance'; end if;
  if coalesce((p_allocation->>'products')::integer,0)+coalesce((p_allocation->>'service')::integer,0)+coalesce((p_allocation->>'delivery')::integer,0)<>p_amount then raise exception 'Refund allocation mismatch'; end if;
  if least(coalesce((p_allocation->>'products')::integer,0),coalesce((p_allocation->>'service')::integer,0),coalesce((p_allocation->>'delivery')::integer,0))<0 then raise exception 'Negative refund allocation'; end if;
  if (select coalesce(sum((allocation->>'products')::integer),0) from public.refunds where order_id=o.id and status<>'failed')+coalesce((p_allocation->>'products')::integer,0)>o.subtotal
    or (select coalesce(sum((allocation->>'service')::integer),0) from public.refunds where order_id=o.id and status<>'failed')+coalesce((p_allocation->>'service')::integer,0)>o.service_fee
    or (select coalesce(sum((allocation->>'delivery')::integer),0) from public.refunds where order_id=o.id and status<>'failed')+coalesce((p_allocation->>'delivery')::integer,0)>o.delivery_fee then raise exception 'Refund exceeds component balance'; end if;
  insert into public.refunds(id,order_id,attempt_id,amount,allocation,reason,approval_actor,responsible_party) values(p_id,o.id,a.id,p_amount,p_allocation,p_reason,p_actor,p_party) returning * into r;
  perform public.commerce_enqueue('refund',o.id,'refund:'||r.id,now(),'{}',r.id);
  return to_jsonb(r);
end $$;
create function public.commerce_protect_operation() returns trigger language plpgsql set search_path='' as $$
begin
  if (to_jsonb(new)-array['status','provider_resource_id','checkout_manifest','retry_safe_until','dispatched_at','resolved_at','error_class']) is distinct from (to_jsonb(old)-array['status','provider_resource_id','checkout_manifest','retry_safe_until','dispatched_at','resolved_at','error_class']) then raise exception 'Operation request is immutable'; end if;
  if old.provider_resource_id is not null and new.provider_resource_id is distinct from old.provider_resource_id then raise exception 'Operation identity is immutable'; end if;
  if old.status='succeeded' and new.status<>'succeeded' then raise exception 'Confirmed success cannot regress'; end if;
  return new;
end $$;
create trigger operations_immutable before update on public.provider_operations for each row execute function public.commerce_protect_operation();
do $$ declare t text; f record; begin
  foreach t in array array['provider_operations','payment_splits','refunds'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('commerce_start_order','commerce_prepare_operation','commerce_dispatch_operation','commerce_refund_reserve') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
