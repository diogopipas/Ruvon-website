create table public.notifications (
  id uuid primary key default gen_random_uuid(), order_id uuid references public.payment_orders(id), event_id uuid references public.order_events(id),
  channel text not null check(channel in ('email','sms')), purpose text not null, recipient_reference text not null,
  template text not null, template_version integer not null default 1, deduplication_key text not null unique,
  provider_id text unique, status text not null default 'pending' check(status in ('pending','sending','unknown','sent','delivered','delayed','failed','skipped')),
  attempts integer not null default 0, created_at timestamptz not null default now(), sent_at timestamptz, last_error text,
  job_id uuid unique references public.background_jobs(id), environment text check(environment in ('sandbox','live')),
  request jsonb, first_dispatch_at timestamptz, retry_safe_until timestamptz, delivered_at timestamptz,
  provider_status text
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

-- Freeze one notification request before sending. Job leases fence all writes;
-- the provider key and body survive a worker restart and lost HTTP response.
create function public.commerce_protect_notification() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.id,new.order_id,new.event_id,new.channel,new.purpose,new.recipient_reference,new.template,new.template_version,new.deduplication_key,new.job_id,new.environment) is distinct from (old.id,old.order_id,old.event_id,old.channel,old.purpose,old.recipient_reference,old.template,old.template_version,old.deduplication_key,old.job_id,old.environment) then raise exception 'Notification identity is immutable'; end if;
  if old.request is not null and new.request is distinct from old.request then raise exception 'Notification request is immutable'; end if;
  if old.provider_id is not null and new.provider_id is distinct from old.provider_id then raise exception 'Notification provider ID is immutable'; end if;
  return new;
end $$;
create trigger protect_notification before update on public.notifications for each row execute function public.commerce_protect_notification();

create function public.commerce_prepare_notification(p_job uuid,p_token uuid,p_channel text,p_recipient text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.background_jobs; o public.payment_orders; n public.notifications;
begin
  select * into strict j from public.background_jobs where id=p_job and state='running' and lease_token=p_token and lease_expires_at>now() for update;
  select * into strict o from public.payment_orders where id=j.order_id and flow_version=2;
  if j.kind not in ('merchant_notify','merchant_preparation','preparation_reminder','operator_alert','customer_update','customer_refund') then raise exception 'Invalid notification job'; end if;
  insert into public.notifications(order_id,event_id,channel,purpose,recipient_reference,template,deduplication_key,job_id,environment)
    values(o.id,case when j.kind in ('customer_update','customer_refund') then j.reference_id else null end,p_channel,j.kind,p_recipient,j.kind,'notification:'||j.id,j.id,o.environment)
    on conflict(job_id) do nothing;
  select * into strict n from public.notifications where job_id=j.id;
  if n.channel<>p_channel or n.recipient_reference<>p_recipient then raise exception 'Notification command conflict'; end if;
  if n.first_dispatch_at is null and (
    (n.purpose='merchant_notify' and (o.operational_status<>'awaiting_merchant' or o.acceptance_deadline<=now())) or
    (n.purpose in ('merchant_preparation','preparation_reminder') and o.operational_status<>'preparing') or
    (n.purpose='operator_alert' and not exists(select 1 from public.order_cases where id=j.reference_id and state='open')) or
    (n.purpose='customer_update' and j.payload->>'state'<>o.operational_status)
  ) then
    update public.notifications set status='skipped' where id=n.id returning * into n;
  end if;
  return to_jsonb(n);
end $$;

create function public.commerce_dispatch_notification(p_id uuid,p_job uuid,p_token uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.notifications; j public.background_jobs; o public.payment_orders;
begin
  select * into strict j from public.background_jobs where id=p_job and state='running' and lease_token=p_token and lease_expires_at>now() for update;
  select * into strict n from public.notifications where id=p_id and job_id=j.id and order_id=j.order_id for update;
  if n.status in ('sent','delivered','delayed','failed','skipped') then return jsonb_build_object('allowed',false); end if;
  select * into strict o from public.payment_orders where id=n.order_id;
  if n.first_dispatch_at is null and (
    (n.purpose='merchant_notify' and (o.operational_status<>'awaiting_merchant' or o.acceptance_deadline<=now())) or
    (n.purpose in ('merchant_preparation','preparation_reminder') and o.operational_status<>'preparing') or
    (n.purpose='operator_alert' and not exists(select 1 from public.order_cases where id=j.reference_id and state='open')) or
    (n.purpose='customer_update' and j.payload->>'state'<>o.operational_status)
  ) then
    update public.notifications set status='skipped' where id=n.id;
    return jsonb_build_object('allowed',false);
  end if;
  if n.retry_safe_until<=now() then
    update public.notifications set status='unknown',last_error='email_reconciliation_required' where id=n.id;
    return jsonb_build_object('allowed',false,'reason','replay_expired');
  end if;
  if n.request is null then
    if jsonb_typeof(p_request->'to')<>'array' or jsonb_array_length(p_request->'to')<>1 or coalesce(length(p_request->>'text'),0)=0 then raise exception 'Invalid email request'; end if;
    update public.notifications set request=p_request where id=n.id;
  elsif n.request is distinct from p_request then raise exception 'Notification request is immutable'; end if;
  update public.notifications set status='sending',attempts=attempts+1,first_dispatch_at=coalesce(first_dispatch_at,now()),retry_safe_until=coalesce(retry_safe_until,now()+interval '23 hours') where id=n.id returning * into n;
  return jsonb_build_object('allowed',true,'request',n.request);
end $$;

create function public.commerce_finish_notification(p_id uuid,p_job uuid,p_token uuid,p_provider_id text default null,p_error text default null,p_definitive boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare n public.notifications;
begin
  perform 1 from public.background_jobs where id=p_job and state='running' and lease_token=p_token and lease_expires_at>now() for update;
  if not found then raise exception 'Lease lost' using errcode='40001'; end if;
  select * into strict n from public.notifications where id=p_id and job_id=p_job for update;
  if n.first_dispatch_at is null then raise exception 'Notification not dispatched'; end if;
  if p_provider_id is not null then
    if n.provider_id is not null and n.provider_id<>p_provider_id then raise exception 'Provider identity conflict'; end if;
    update public.notifications set provider_id=p_provider_id,status=case when status in ('delivered','delayed','failed') then status else 'sent' end,sent_at=coalesce(sent_at,now()),last_error=case when status='failed' then last_error else null end where id=n.id;
  elsif p_error is not null and n.status in ('pending','sending','unknown') then
    update public.notifications set status=case when p_definitive then 'failed' else 'unknown' end,last_error=left(p_error,80) where id=n.id;
  else raise exception 'Notification outcome required'; end if;
end $$;

-- Signed callbacks store only references/status, never email bodies or contacts.
create function public.commerce_apply_notification_event(p_event uuid,p_job uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.external_events; n public.notifications; next_status text; tag text;
begin
  perform 1 from public.background_jobs where id=p_job and kind='external_event' and reference_id=p_event and state='running' and lease_token=p_token and lease_expires_at>now() for update;
  if not found then raise exception 'Lease lost' using errcode='40001'; end if;
  select * into strict e from public.external_events where id=p_event and provider='resend' and verified for update;
  if e.state<>'pending' then return; end if;
  if e.payload->>'quarantine_reason' is not null then
    update public.external_events set state='quarantined',processing_error=e.payload->>'quarantine_reason',processed_at=now() where id=e.id;
    return;
  end if;
  tag:=e.payload->>'notification_id';
  select * into n from public.notifications where id::text=tag and environment=e.environment and first_dispatch_at is not null and channel='email' and (provider_id is null or provider_id=e.resource_id) and lower(coalesce(substring(request->>'from' from '<([^<>]+)>$'),request->>'from'))=e.payload->>'from' for update;
  if not found then
    update public.external_events set state='quarantined',processing_error='UNMATCHED_NOTIFICATION',processed_at=now() where id=e.id;
    return;
  end if;
  next_status:=case
    when e.payload->>'type' in ('email.bounced','email.failed','email.complained','email.suppressed') then 'failed'
    when n.status='failed' then 'failed'
    when e.payload->>'type'='email.delivered' or n.status='delivered' then 'delivered'
    when e.payload->>'type'='email.delivery_delayed' then 'delayed'
    when e.payload->>'type'='email.sent' then case when n.status='delayed' then 'delayed' else 'sent' end
    else null end;
  if next_status is null then
    update public.external_events set state='quarantined',processing_error='UNSUPPORTED_NOTIFICATION_EVENT',processed_at=now() where id=e.id;
    return;
  end if;
  update public.notifications set provider_id=e.resource_id,status=next_status,
    provider_status=case when n.status='failed' and next_status='failed' then provider_status else e.payload->>'type' end,
    sent_at=coalesce(sent_at,e.provider_time,now()),
    delivered_at=case when next_status='delivered' then coalesce(delivered_at,e.provider_time,now()) else delivered_at end,
    last_error=case when next_status='failed' then coalesce(last_error,e.payload->>'type') else null end where id=n.id;
  update public.external_events set state='processed',processed_at=now() where id=e.id;
end $$;

-- Customer email work commits with the order event, not with the HTTP response.
create function public.commerce_event_notifications() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.payment_orders;
begin
  select * into strict o from public.payment_orders where id=new.order_id;
  if o.flow_version<>2 then return new; end if;
  if new.after_state<>new.before_state and new.after_state in ('awaiting_merchant','confirming','preparing','ready_for_pickup','in_delivery','delivered','cancelling','cancelled','returning','returned','manual_review') and o.recipient_email is not null then
    perform public.commerce_enqueue('customer_update',o.id,'customer-email:'||new.id,now(),jsonb_build_object('state',new.after_state),new.id);
  end if;
  if new.after_state='preparing' and new.before_state<>new.after_state then
    perform public.commerce_enqueue('merchant_preparation',o.id,'merchant-prepare:'||new.id);
  end if;
  if new.metadata->>'kind'='refund' and new.metadata->>'outcome'='succeeded' and o.recipient_email is not null then
    perform public.commerce_enqueue('customer_refund',o.id,'refund-email:'||new.id,now(),'{}',new.id);
  end if;
  return new;
end $$;
create trigger order_event_notifications after insert on public.order_events for each row execute function public.commerce_event_notifications();

do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('commerce_prepare_notification','commerce_dispatch_notification','commerce_finish_notification','commerce_apply_notification_event') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
revoke all on function public.commerce_protect_notification(),public.commerce_event_notifications() from public,anon,authenticated;
