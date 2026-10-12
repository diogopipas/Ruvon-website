create table public.order_cases (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.payment_orders(id),
  case_key text not null unique, type text not null, reason text not null,
  state text not null default 'open' check(state in ('open','acknowledged','resolved')),
  responsible_party text not null default 'unknown' check(responsible_party in ('unknown','merchant','ruvon','delivery_provider','customer')),
  disputed_amount integer not null default 0 check(disputed_amount>=0), evidence jsonb not null default '[]',
  resolution jsonb, approval_actor text, acknowledged_at timestamptz, created_at timestamptz not null default now(), resolved_at timestamptz
);
create index cases_open on public.order_cases(created_at) where state<>'resolved';
create index cases_order on public.order_cases(order_id);
alter table public.order_cases enable row level security;
revoke all on public.order_cases from public,anon,authenticated,service_role;
grant select on public.order_cases to service_role;
create function public.commerce_open_case(p_order uuid,p_key text,p_type text,p_reason text,p_evidence jsonb default '[]') returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; o public.payment_orders;
begin
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order and flow_version=2 for update;
  insert into public.order_cases(order_id,case_key,type,reason,evidence) values(o.id,p_key,p_type,p_reason,p_evidence) on conflict(case_key) do nothing returning id into cid;
  if cid is null then select id into cid from public.order_cases where case_key=p_key and order_id=o.id; return cid; end if;
  update public.payment_orders set review_previous_status=case when operational_status<>'manual_review' then operational_status else review_previous_status end,operational_status=case when operational_status in ('completed','cancelled') then operational_status else 'manual_review' end,review_reason=p_reason,settlement_status='disputed',version=version+1 where id=o.id;
  perform public.commerce_append_event(o.id,'case:'||cid,md5(p_reason),'worker','system',o.operational_status,p_reason,jsonb_build_object('case_id',cid,'type',p_type));
  perform public.commerce_enqueue('operator_alert',o.id,'case-email:'||cid,now(),jsonb_build_object('channel','email'),cid);
  perform public.commerce_enqueue('operator_alert',o.id,'case-sms:'||cid,now()+interval '5 minutes',jsonb_build_object('channel','sms'),cid);
  return cid;
end $$;
create function public.commerce_customer_command(p_order uuid,p_owner text,p_command uuid,p_version integer,p_type text,p_reason text,p_evidence jsonb default '[]') returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; previous public.order_events; h text; cid uuid;
begin
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order and owner_hash=p_owner and flow_version=2 for update;
  h:=md5(jsonb_build_object('type',p_type,'reason',p_reason,'evidence',p_evidence)::text);
  select * into previous from public.order_events where command_key=p_command::text;
  if found then
    if previous.order_id<>o.id or previous.actor_id<>p_owner or previous.command_hash<>h then raise exception 'Command conflict' using errcode='23505'; end if;
    return previous.outcome;
  end if;
  if o.version<>p_version then raise exception 'Stale version' using errcode='40001'; end if;
  if p_type='cancel' and o.operational_status in ('awaiting_payment','awaiting_merchant') then
    update public.payment_orders set operational_status='cancelling',cancellation_reason=p_reason,version=version+1 where id=o.id;
    perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
  elsif p_type in ('cancel','missing_item','wrong_item','damaged','delivery','other') then
    cid:=public.commerce_open_case(o.id,'customer:'||p_command,p_type,p_reason,p_evidence);
  else raise exception 'Invalid command'; end if;
  return public.commerce_append_event(o.id,p_command::text,h,'customer',p_owner,o.operational_status,p_reason);
end $$;
create function public.merchant_command(p_order uuid,p_command uuid,p_version integer,p_action text,p_reason text default null,p_seal text default null,p_saleable jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; previous public.order_events; h text; r record; quantity integer;
begin
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order and flow_version=2 for update;
  if not public.commerce_merchant_store(o.store_id) then raise exception 'Forbidden' using errcode='42501'; end if;
  h:=md5(jsonb_build_object('action',p_action,'reason',p_reason,'seal',p_seal,'saleable',p_saleable)::text);
  select * into previous from public.order_events where command_key=p_command::text;
  if found then
    if previous.order_id<>o.id or previous.actor_id<>auth.uid()::text or previous.command_hash<>h then raise exception 'Command conflict' using errcode='23505'; end if;
    return previous.outcome;
  end if;
  if o.version<>p_version then raise exception 'Stale version' using errcode='40001'; end if;
  if p_action='accept' then
    if o.operational_status<>'awaiting_merchant' or o.payment_status<>'authorised' or o.acceptance_deadline<=now() then raise exception 'Acceptance closed' using errcode='40001'; end if;
    update public.payment_orders set operational_status='confirming',merchant_status='accepted',accepted_at=now(),version=version+1 where id=o.id;
    perform public.commerce_enqueue('confirm_order',o.id,'confirm:'||o.current_attempt_id);
  elsif p_action in ('reject','unavailable') then
    if o.operational_status<>'awaiting_merchant' then raise exception 'Rejection closed' using errcode='40001'; end if;
    if p_action='unavailable' and not exists(select 1 from public.inventory_reservations where order_id=o.id and sku=p_seal) then raise exception 'Unavailable item is not in this order'; end if;
    update public.payment_orders set operational_status='cancelling',merchant_status='rejected',cancellation_reason=coalesce(p_reason,'MERCHANT_REJECTED'),version=version+1 where id=o.id;
    if p_action='unavailable' then update public.store_products set enabled=false,version=version+1 where store_id=o.store_id and sku=p_seal; end if;
    perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
  elsif p_action='ready' then
    if o.operational_status<>'preparing' or o.payment_status<>'paid' or nullif(p_seal,'') is null or not exists(select 1 from public.deliveries where order_id=o.id and direction='outbound' and status in ('pending','pickup')) then raise exception 'Preparation not permitted' using errcode='40001'; end if;
    update public.payment_orders set operational_status='ready_for_pickup',merchant_status='ready',ready_at=now(),version=version+1 where id=o.id;
  elsif p_action='correct_ready' then
    if o.operational_status<>'ready_for_pickup' then raise exception 'Correction not permitted' using errcode='40001'; end if;
    update public.payment_orders set operational_status='preparing',merchant_status='preparing',ready_at=null,version=version+1 where id=o.id;
  elsif p_action='return_received' then
    if o.operational_status not in ('returned','manual_review') or not exists(select 1 from public.deliveries where order_id=o.id and direction='return' and status='delivered') then raise exception 'Return not verified'; end if;
    if coalesce(length(trim(p_reason)),0)<3 then raise exception 'Return condition required'; end if;
    for r in select key,value from jsonb_each_text(p_saleable) order by key loop
      quantity:=r.value::integer;
      if quantity<0 or not exists(select 1 from public.inventory_reservations ir where ir.order_id=o.id and ir.sku=r.key and ir.status='consumed' and ir.quantity>=r.value::integer) then raise exception 'Invalid return quantity'; end if;
      update public.store_products set stock_on_hand=stock_on_hand+quantity,version=version+1 where store_id=o.store_id and sku=r.key;
      update public.inventory_reservations set status='restocked' where order_id=o.id and sku=r.key;
    end loop;
    perform public.commerce_open_case(o.id,'return-resolution:'||o.id,'return','RETURN_FINANCIAL_REVIEW');
  else raise exception 'Unsupported merchant command'; end if;
  return public.commerce_append_event(o.id,p_command::text,h,'merchant',auth.uid()::text,o.operational_status,p_reason,jsonb_build_object('seal',p_seal,'saleable',p_saleable));
end $$;
revoke all on function public.commerce_open_case(uuid,text,text,text,jsonb),public.commerce_customer_command(uuid,text,uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_open_case(uuid,text,text,text,jsonb),public.commerce_customer_command(uuid,text,uuid,integer,text,text,jsonb) to service_role;
revoke all on function public.merchant_command(uuid,uuid,integer,text,text,text,jsonb) from public,anon;
grant execute on function public.merchant_command(uuid,uuid,integer,text,text,text,jsonb) to authenticated;
create or replace function public.merchant_orders() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'store_id',o.store_id,'operational_status',o.operational_status,'version',o.version,'merchant_status',o.merchant_status,'items',o.items,'acceptance_deadline',o.acceptance_deadline,'created_at',o.created_at,'preparation_allowed',o.operational_status in ('preparing','ready_for_pickup'),'review_reason',o.review_reason,
    'eta',(select d.eta from public.deliveries d where d.order_id=o.id and d.direction='outbound'),
    'tracking_url',(select d.tracking_url from public.deliveries d where d.order_id=o.id and d.direction='outbound'),
    'return_received_allowed',exists(select 1 from public.deliveries d where d.order_id=o.id and d.direction='return' and d.status='delivered') and not exists(select 1 from public.order_cases c where c.order_id=o.id and c.case_key='return-resolution:'||o.id)
  ) order by o.created_at desc),'[]') from public.payment_orders o where o.flow_version=2 and public.commerce_merchant_store(o.store_id) and o.created_at>now()-interval '30 days';
$$;
