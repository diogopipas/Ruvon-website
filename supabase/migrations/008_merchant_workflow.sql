create table public.notifications (
  id uuid primary key default gen_random_uuid(), order_id uuid references public.payment_orders(id), event_id uuid references public.order_events(id),
  channel text not null check(channel in ('email','sms')), purpose text not null, recipient_reference text not null,
  template text not null, template_version integer not null default 1, deduplication_key text not null unique,
  provider_id text, status text not null default 'pending' check(status in ('pending','sending','unknown','sent','delivered','failed')),
  attempts integer not null default 0, created_at timestamptz not null default now(), sent_at timestamptz, last_error text
);
create index notifications_due on public.notifications(created_at) where status in ('pending','failed');
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated,service_role;
grant select on public.notifications to service_role;
create function public.commerce_notification_intent(p_order uuid,p_key text,p_channel text,p_purpose text,p_recipient text) returns void language sql security definer set search_path='' as $$
  insert into public.notifications(order_id,channel,purpose,recipient_reference,template,deduplication_key) values(p_order,p_channel,p_purpose,p_recipient,p_purpose,p_key) on conflict(deduplication_key) do nothing;
$$;
revoke all on function public.commerce_notification_intent(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.commerce_notification_intent(uuid,text,text,text,text) to service_role;
create function public.commerce_merchant_store(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.store_users where store_id=p_store and user_id=auth.uid() and active);
$$;
create function public.merchant_heartbeat(p_store uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.commerce_merchant_store(p_store) then raise exception 'Forbidden' using errcode='42501'; end if;
  update public.stores set heartbeat_at=now() where id=p_store;
end $$;
create function public.merchant_inventory(p_store uuid,p_sku text,p_quantity integer,p_enabled boolean,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare product public.store_products;
begin
  if not public.commerce_merchant_store(p_store) then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into strict product from public.store_products where store_id=p_store and sku=p_sku for update;
  if product.version<>p_version then raise exception 'Stale version' using errcode='40001'; end if;
  if p_quantity<product.reserved_quantity then raise exception 'Reserved stock cannot be removed'; end if;
  update public.store_products set stock_on_hand=p_quantity,enabled=p_enabled,version=version+1 where store_id=p_store and sku=p_sku returning * into product;
  return to_jsonb(product);
end $$;
create function public.merchant_set_paused(p_store uuid,p_paused boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.commerce_merchant_store(p_store) then raise exception 'Forbidden' using errcode='42501'; end if;
  update public.stores set paused=p_paused,pause_reason=case when p_paused then 'MERCHANT_PAUSED' else null end where id=p_store;
end $$;
-- Store-scoped safe DTO: never returns owner hashes, provider requests or financial records.
create function public.merchant_orders() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'store_id',o.store_id,'operational_status',o.operational_status,'version',o.version,'merchant_status',o.merchant_status,'items',o.items,'acceptance_deadline',o.acceptance_deadline,'created_at',o.created_at,'preparation_allowed',o.operational_status in ('preparing','ready_for_pickup'),'review_reason',o.review_reason) order by o.created_at desc),'[]') from public.payment_orders o where o.flow_version=2 and public.commerce_merchant_store(o.store_id) and o.created_at>now()-interval '30 days';
$$;
create function public.merchant_stores() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'paused',s.paused,'heartbeat_at',s.heartbeat_at)),'[]') from public.stores s where public.commerce_merchant_store(s.id);
$$;
create function public.merchant_products() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('store_id',p.store_id,'sku',p.sku,'name',s.name,'unit',s.unit,'stock_on_hand',p.stock_on_hand,'reserved_quantity',p.reserved_quantity,'enabled',p.enabled,'version',p.version) order by s.name),'[]') from public.store_products p join public.catalog_skus s on s.sku=p.sku where public.commerce_merchant_store(p.store_id);
$$;
revoke all on function public.commerce_merchant_store(uuid) from public,anon,authenticated;
revoke all on function public.merchant_heartbeat(uuid),public.merchant_inventory(uuid,text,integer,boolean,integer),public.merchant_set_paused(uuid,boolean),public.merchant_orders(),public.merchant_stores() from public,anon;
grant execute on function public.merchant_heartbeat(uuid),public.merchant_inventory(uuid,text,integer,boolean,integer),public.merchant_set_paused(uuid,boolean),public.merchant_orders(),public.merchant_stores() to authenticated;
revoke all on function public.merchant_products() from public,anon;
grant execute on function public.merchant_products() to authenticated;
