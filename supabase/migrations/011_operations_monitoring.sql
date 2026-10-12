create table public.worker_health (
  name text primary key, last_started_at timestamptz, last_success_at timestamptz,
  last_error text, jobs_processed integer not null default 0
);
create table public.commerce_capabilities (
  environment text not null check(environment in ('sandbox','live')), capability text not null,
  verified_at timestamptz not null, verified_by text not null, evidence_reference text not null,
  expires_at timestamptz not null, primary key(environment,capability), check(expires_at>verified_at)
);
alter table public.worker_health enable row level security;
alter table public.commerce_capabilities enable row level security;
revoke all on public.worker_health,public.commerce_capabilities from public,anon,authenticated,service_role;
grant select on public.worker_health,public.commerce_capabilities to service_role;
create view public.commerce_operations with (security_invoker=true) as
  select id,store_id,operational_status,payment_status,merchant_status,settlement_status,version,created_at,acceptance_deadline,review_reason from public.payment_orders where flow_version=2;
revoke all on public.commerce_operations from public,anon,authenticated;
grant select on public.commerce_operations to service_role;
create function public.commerce_worker_health(p_success boolean,p_jobs integer default 0,p_error text default null) returns void language sql security definer set search_path='' as $$
  insert into public.worker_health(name,last_started_at,last_success_at,jobs_processed,last_error) values('orders',now(),case when p_success then now() else null end,p_jobs,p_error)
  on conflict(name) do update set last_started_at=now(),last_success_at=case when p_success then now() else public.worker_health.last_success_at end,jobs_processed=p_jobs,last_error=p_error;
$$;
create function public.commerce_checkout_ready(p_environment text,p_method text default 'MBW') returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.worker_health where name='orders' and last_success_at>now()-interval '120 seconds') and not exists(
    select 1 from unnest(array['marketplace','authorisation_'||p_method,'void','refund','split_hold','split_schedule','settlement_evidence','uber_booking_recovery','uber_returns','notifications'] || case when p_environment='live' then array['credential_rotation','sandbox_acceptance','uber_alcohol_portugal','monitoring','legal_policies','production_pilot_approval'] else array[]::text[] end) required(capability)
    where not exists(select 1 from public.commerce_capabilities c where c.environment=p_environment and c.capability=required.capability and c.expires_at>now())
  );
$$;
create function public.commerce_apply_operation(p_operation uuid,p_job uuid,p_token uuid,p_fact jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.provider_operations; o public.payment_orders; a public.payment_attempts; target text; rid text; d public.deliveries; split jsonb; total_splits bigint:=0; r public.refunds;
begin
  perform set_config('ruvon.command','on',true);
  -- Use the same order -> operation -> job lock order as command/dispatch paths.
  select po.* into strict o from public.payment_orders po join public.provider_operations x on x.order_id=po.id where x.id=p_operation for update of po;
  select * into strict op from public.provider_operations where id=p_operation for update;
  perform 1 from public.background_jobs where id=p_job and order_id=o.id and lease_token=p_token and lease_expires_at>now() and state='running' for update;
  if not found then raise exception 'Lease lost' using errcode='40001'; end if;
  target:=p_fact->>'state'; rid:=p_fact->>'resource_id';
  if target not in ('succeeded','failed','pending','unknown') then raise exception 'Invalid provider outcome'; end if;
  if op.status='succeeded' then
    if target='failed' or (rid is not null and rid is distinct from op.provider_resource_id) then
      perform public.commerce_open_case(o.id,'terminal-conflict:'||op.id,'provider','PROVIDER_STATE_CONFLICT');
    end if;
    return to_jsonb(o);
  end if;
  if op.status='failed' and target='succeeded' then
    perform public.commerce_open_case(o.id,'late-success:'||op.id,'provider','PROVIDER_STATE_CONFLICT');
    select * into strict o from public.payment_orders where id=o.id;
  end if;
  if op.provider_resource_id is not null and rid is not null and op.provider_resource_id<>rid then
    perform public.commerce_open_case(o.id,'identity-conflict:'||op.id,'provider','PROVIDER_STATE_CONFLICT'); return to_jsonb(o);
  end if;
  if target='succeeded' and nullif(rid,'') is null then raise exception 'Missing resource identity'; end if;
  if target='succeeded' and op.kind in ('authorise','capture') and (p_fact->>'amount')::integer is distinct from o.total then
    perform public.commerce_open_case(o.id,'amount-conflict:'||op.id,'provider','PROVIDER_STATE_CONFLICT'); return to_jsonb(o);
  end if;
  update public.provider_operations set status=target,provider_resource_id=coalesce(provider_resource_id,rid),checkout_manifest=coalesce(checkout_manifest,p_fact->'checkout_manifest'),resolved_at=case when target in ('succeeded','failed') then now() else null end,error_class=p_fact->>'error_class' where id=op.id;
  if op.attempt_id is not null then select * into strict a from public.payment_attempts where id=op.attempt_id; end if;
  if op.kind='authorise' then
    if target='succeeded' then
      if a.captured_cents>0 then return to_jsonb(o); end if;
      if (p_fact->>'expires_at')::timestamptz<=now() then raise exception 'Authorisation expired'; end if;
      update public.payment_attempts set authorisation_id=rid::uuid,provider_id=rid::uuid,payment_status='authorised',authorised_cents=o.total,state='pending',expires_at=(p_fact->>'expires_at')::timestamptz where id=a.id;
      update public.payment_orders set payment_status='authorised',state='pending',operational_status=case when operational_status='awaiting_payment' then 'awaiting_merchant' else operational_status end,merchant_status=case when operational_status='awaiting_payment' then 'pending' else merchant_status end,acceptance_deadline=now()+interval '3 minutes',version=version+1 where id=o.id;
      if o.operational_status='awaiting_payment' then
        perform public.commerce_enqueue('merchant_notify',o.id,'merchant-email:'||a.id,now(),jsonb_build_object('channel','email'));
        perform public.commerce_enqueue('merchant_notify',o.id,'merchant-sms:'||a.id,now()+interval '60 seconds',jsonb_build_object('channel','sms'));
        perform public.commerce_enqueue('merchant_timeout',o.id,'merchant-timeout:'||a.id,now()+interval '3 minutes');
      else perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id); end if;
    elsif target='failed' then
      update public.payment_attempts set state='failed',payment_status='failed' where id=a.id and captured_cents=0;
      update public.payment_orders set payment_status='failed',state='failed',version=version+1 where id=o.id and state<>'paid';
      perform public.commerce_inventory(o.id,'release');
    else
      update public.payment_attempts set state='reconciling',payment_status='unknown',provider_id=coalesce(provider_id,rid::uuid) where id=a.id and state<>'paid';
      update public.payment_orders set state='reconciling',payment_status='unknown' where id=o.id and state<>'paid';
    end if;
  elsif op.kind='capture' then
    if target='succeeded' then
      for split in select value from jsonb_array_elements(p_fact->'splits') loop total_splits:=total_splits+(split->>'amount')::integer; end loop;
      if total_splits<>o.total or jsonb_array_length(p_fact->'splits')<>2 then raise exception 'Capture split mismatch'; end if;
      update public.payment_attempts set capture_id=rid::uuid,captured_cents=o.total,state='paid',payment_status='paid',paid_at=coalesce(paid_at,now()) where id=a.id;
      update public.payment_orders set state='paid',payment_status='paid',paid_at=coalesce(paid_at,now()),version=version+1 where id=o.id;
      for split in select value from jsonb_array_elements(p_fact->'splits') loop
        if (split->>'amount')::integer<>(o.allocation->>(case when split->>'beneficiary'='merchant' then 'merchant' else 'ruvon' end))::integer then raise exception 'Beneficiary mismatch'; end if;
        insert into public.payment_splits(order_id,attempt_id,capture_id,provider_split_id,provider_account_id,beneficiary,store_id,amount,clearing_date) values(o.id,a.id,rid::uuid,(split->>'id')::uuid,(split->>'account_id')::uuid,split->>'beneficiary',case when split->>'beneficiary'='merchant' then o.store_id else null end,(split->>'amount')::integer,(split->>'clearing_date')::date);
      end loop;
      if o.operational_status='confirming' then perform public.commerce_enqueue('book_delivery',o.id,'booking:'||a.id);
      else perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id); end if;
    elsif target='failed' then
      update public.payment_orders set operational_status='cancelling',cancellation_reason='CAPTURE_FAILED',version=version+1 where id=o.id;
      perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
    end if;
  elsif op.kind='void' and target='succeeded' then
    if a.captured_cents>0 then perform public.commerce_open_case(o.id,'void-capture:'||op.id,'payment','PROVIDER_STATE_CONFLICT');
    else
      update public.payment_attempts set payment_status='voided',state='failed' where id=a.id;
      update public.payment_orders set payment_status='voided',version=version+1 where id=o.id;
    end if;
  elsif op.kind='refund' then
    select * into strict r from public.refunds where id=(op.request->>'refund_id')::uuid and order_id=o.id for update;
    if target='succeeded' and (p_fact->>'amount')::integer is distinct from r.amount then raise exception 'Refund amount mismatch'; end if;
    update public.refunds set operation_id=op.id,provider_id=coalesce(provider_id,rid::uuid),status=case target when 'pending' then 'processing' else target end,updated_at=now() where id=r.id;
    if target='failed' then perform public.commerce_open_case(o.id,'refund-failed:'||r.id,'refund','REFUND_FAILED'); end if;
  elsif op.kind='delivery_create' and target='succeeded' then
    insert into public.deliveries(order_id,direction,operation_id,provider_delivery_id,provider_account,environment,provider_quote_id,raw_status,status,tracking_url,quoted_cost,actual_cost,eta)
    values(o.id,'outbound',op.id,rid,op.account,op.environment,p_fact->>'quote_id',p_fact->>'status',p_fact->>'status',p_fact->>'tracking_url',o.delivery_fee,(p_fact->>'cost')::integer,(p_fact->>'eta')::timestamptz) returning * into d;
    if o.operational_status='confirming' and o.payment_status='paid' then
      update public.payment_orders set operational_status='preparing',merchant_status='preparing',version=version+1 where id=o.id;
      perform public.commerce_enqueue('preparation_reminder',o.id,'prep-remind:'||o.id,now()+interval '10 minutes');
      perform public.commerce_enqueue('preparation_overdue',o.id,'prep-overdue:'||o.id,now()+interval '20 minutes');
      perform public.commerce_enqueue('courier_check',o.id,'courier-check:'||o.id,now()+interval '10 minutes');
    else perform public.commerce_open_case(o.id,'booking-after-stop:'||op.id,'delivery','DELIVERY_BOOKING_UNCERTAIN'); end if;
  elsif op.kind='delivery_create' and target='failed' then
    update public.payment_orders set operational_status='cancelling',cancellation_reason='DELIVERY_BOOKING_FAILED',version=version+1 where id=o.id;
    perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
  elsif op.kind='split_schedule' and target='succeeded' then
    update public.payment_splits set clearing_date=(p_fact->>'clearing_date')::date,release_state='scheduled' where provider_split_id=(op.request->>'split_id')::uuid and order_id=o.id;
    update public.payment_orders set settlement_status=case when review_reason is not null then 'disputed' else 'scheduled' end,version=version+1 where id=o.id;
    perform public.commerce_enqueue('settlement_reconcile',o.id,'settlement:'||o.id,now()+interval '1 day');
  end if;
  if not exists(select 1 from public.order_events where command_key='operation:'||op.id||':'||target) then perform public.commerce_append_event(o.id,'operation:'||op.id||':'||target,md5(p_fact::text),'provider',op.provider,o.operational_status,null,jsonb_build_object('operation_id',op.id,'kind',op.kind,'outcome',target)); end if;
  return (select to_jsonb(po) from public.payment_orders po where po.id=o.id);
end $$;
create function public.commerce_apply_delivery(p_order uuid,p_fact jsonb,p_job uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; d public.deliveries; incoming_status text; before_state text; parent public.deliveries;
begin
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order for update;
  perform 1 from public.background_jobs where id=p_job and order_id=o.id and lease_token=p_token and lease_expires_at>now() and state='running' for update;
  if not found then raise exception 'Lease lost' using errcode='40001'; end if;
  select * into d from public.deliveries where order_id=o.id and provider_delivery_id=p_fact->>'id' for update;
  if not found then
    select * into strict parent from public.deliveries where order_id=o.id and direction='outbound' and provider_delivery_id=p_fact->>'parent_id';
    insert into public.deliveries(order_id,direction,parent_delivery_id,provider_delivery_id,provider_account,environment,raw_status,status) values(o.id,'return',parent.id,p_fact->>'id',parent.provider_account,parent.environment,p_fact->>'status',p_fact->>'status') returning * into d;
  end if;
  incoming_status:=p_fact->>'status'; before_state:=o.operational_status;
  if incoming_status not in ('pending','pickup','pickup_complete','dropoff','delivered','canceled','returned') then raise exception 'Unknown delivery status'; end if;
  if (d.status in ('delivered','returned','canceled') and d.status<>incoming_status) or
    (d.status in ('pickup_complete','dropoff') and incoming_status in ('pending','pickup')) or
    (d.status='dropoff' and incoming_status='pickup_complete') or
    (o.operational_status='cancelled' and incoming_status in ('pickup_complete','dropoff','delivered')) then
    perform public.commerce_open_case(o.id,'delivery-conflict:'||d.id,'delivery','PROVIDER_STATE_CONFLICT'); return;
  end if;
  update public.deliveries set status=incoming_status,raw_status=incoming_status,eta=coalesce((p_fact->>'eta')::timestamptz,eta),updated_at=now(),picked_up_at=case when incoming_status in ('pickup_complete','dropoff','delivered') then coalesce(picked_up_at,now()) else picked_up_at end,delivered_at=case when incoming_status='delivered' then coalesce(delivered_at,now()) else delivered_at end,verification_passed=coalesce((p_fact->>'verification_passed')::boolean,verification_passed),verification_at=case when p_fact ? 'verification_passed' then now() else verification_at end where id=d.id;
  if d.direction='return' then
    if incoming_status='delivered' then update public.payment_orders set operational_status=case when operational_status='manual_review' then operational_status else 'returned' end,version=version+1 where id=o.id;
    else update public.payment_orders set operational_status=case when operational_status='manual_review' then operational_status else 'returning' end,settlement_status='held',version=version+1 where id=o.id; end if;
    perform public.commerce_enqueue('return_overdue',o.id,'return-overdue:'||d.id,d.created_at+interval '45 minutes');
  elsif incoming_status in ('pickup_complete','dropoff','delivered') then
    if o.payment_status<>'paid' then perform public.commerce_open_case(o.id,'unpaid-pickup:'||d.id,'payment','PROVIDER_STATE_CONFLICT'); end if;
    perform public.commerce_inventory(o.id,'consume');
    update public.payment_orders set operational_status=case when operational_status='manual_review' then operational_status when incoming_status='delivered' then 'delivered' else 'in_delivery' end,picked_up_at=coalesce(picked_up_at,now()),delivered_at=case when incoming_status='delivered' then coalesce(delivered_at,now()) else delivered_at end,version=version+1 where id=o.id and operational_status not in ('completed','cancelled');
    if incoming_status='delivered' then
      if o.requires_age_verification and (p_fact->>'verification_passed')::boolean is distinct from true then perform public.commerce_open_case(o.id,'verification:'||d.id,'delivery','AGE_VERIFICATION_EVIDENCE_MISSING');
      else perform public.commerce_enqueue('schedule_clearing',o.id,'clearing:'||o.id); end if;
    end if;
  elsif incoming_status in ('canceled','returned') then
    if p_fact->>'return_id' is not null then
      update public.payment_orders set operational_status=case when operational_status='manual_review' then operational_status else 'returning' end,settlement_status='held',version=version+1 where id=o.id;
      perform public.commerce_enqueue('delivery_reconcile',o.id,'return-reconcile:'||(p_fact->>'return_id'),now(),jsonb_build_object('delivery_id',p_fact->>'return_id','parent_id',d.provider_delivery_id));
    elsif o.picked_up_at is null then
      update public.payment_orders set operational_status='cancelling',cancellation_reason='DELIVERY_CANCELLED',version=version+1 where id=o.id;
      perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
    else perform public.commerce_open_case(o.id,'cancel-after-pickup:'||d.id,'delivery','UNSAFE_DELIVERY_CANCELLATION'); end if;
  end if;
  if not exists(select 1 from public.order_events where command_key='delivery:'||d.id||':'||incoming_status) then perform public.commerce_append_event(o.id,'delivery:'||d.id||':'||incoming_status,md5(incoming_status),'provider','uber',before_state,null,jsonb_build_object('direction',d.direction,'provider_delivery_id',d.provider_delivery_id)); end if;
end $$;
create function public.commerce_deadline(p_order uuid,p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; a public.payment_attempts;
begin
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order for update;
  if p_kind='merchant_timeout' and o.operational_status='awaiting_merchant' and o.acceptance_deadline<=now() then
    update public.payment_orders set operational_status='cancelling',merchant_status='timed_out',cancellation_reason='MERCHANT_TIMEOUT',version=version+1 where id=o.id;
    perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
    if (select count(*) from public.payment_orders where store_id=o.store_id and merchant_status='timed_out' and created_at>now()-interval '1 day')>=3 then update public.stores set paused=true,pause_reason='REPEATED_TIMEOUTS' where id=o.store_id; end if;
  elsif p_kind='checkout_expiry' and o.operational_status='awaiting_payment' and o.reservation_expires_at<=now() then
    update public.payment_orders set operational_status='cancelling',cancellation_reason='CHECKOUT_EXPIRED',version=version+1 where id=o.id;
    perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
  elsif p_kind='preparation_overdue' and o.operational_status='preparing' then perform public.commerce_open_case(o.id,'prep-overdue:'||o.id,'merchant','MERCHANT_DELAY');
  elsif p_kind='return_overdue' and o.operational_status='returning' then perform public.commerce_open_case(o.id,'return-overdue:'||o.id,'delivery','RETURN_OVERDUE');
  end if;
  if not exists(select 1 from public.order_events where command_key='deadline:'||p_kind||':'||o.id) then perform public.commerce_append_event(o.id,'deadline:'||p_kind||':'||o.id,md5(p_kind),'worker','system',o.operational_status,p_kind); end if;
end $$;
create function public.commerce_close_cancellation(p_order uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; refunded bigint;
begin
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order for update;
  if o.operational_status='cancelled' then return true; end if;
  if o.operational_status<>'cancelling' then return false; end if;
  -- A persisted but never dispatched intent can be safely abandoned.
  update public.provider_operations set status='failed',error_class='cancelled_before_dispatch',resolved_at=now() where order_id=o.id and status='created' and kind in ('authorise','capture','delivery_create');
  if o.payment_status='authorisation_pending' and not exists(select 1 from public.provider_operations where order_id=o.id and kind='authorise' and dispatched_at is not null) then
    update public.payment_attempts set state='failed',payment_status='failed' where id=o.current_attempt_id;
    update public.payment_orders set payment_status='failed',state='failed' where id=o.id;
    o.payment_status:='failed';
  end if;
  if exists(select 1 from public.provider_operations where order_id=o.id and status in ('created','dispatching','pending','unknown') and kind in ('authorise','capture','delivery_create','delivery_cancel','void','refund')) then return false; end if;
  if exists(select 1 from public.deliveries where order_id=o.id and not (status in ('canceled','returned') or (direction='return' and status='delivered'))) then return false; end if;
  select coalesce(sum(amount),0) into refunded from public.refunds where order_id=o.id and status='succeeded';
  if o.payment_status not in ('not_started','failed','expired','voided') and not (o.payment_status='paid' and refunded=o.total) then return false; end if;
  perform public.commerce_inventory(o.id,'release');
  update public.payment_orders set operational_status='cancelled',cancelled_at=now(),version=version+1 where id=o.id;
  perform public.commerce_append_event(o.id,'cancelled:'||o.id,md5('cancelled'),'worker','system','cancelling',o.cancellation_reason);
  return true;
end $$;
create function public.commerce_sweep() returns void language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; op public.provider_operations; bucket text:=floor(extract(epoch from now())/60)::text;
begin
  for o in select * from public.payment_orders where flow_version=2 and current_attempt_id is not null and operational_status not in ('completed','cancelled') loop
    if o.operational_status='awaiting_merchant' then perform public.commerce_enqueue('merchant_timeout',o.id,'timeout-sweep:'||o.id||':'||bucket,greatest(now(),o.acceptance_deadline)); end if;
    if o.operational_status='cancelling' then perform public.commerce_enqueue('cancel_order',o.id,'cancel-sweep:'||o.id||':'||bucket); end if;
    if o.operational_status='confirming' and o.payment_status='authorised' then perform public.commerce_enqueue('confirm_order',o.id,'confirm-sweep:'||o.id||':'||bucket); end if;
    if o.operational_status='confirming' and o.payment_status='paid' then perform public.commerce_enqueue('book_delivery',o.id,'book-sweep:'||o.id||':'||bucket); end if;
    if exists(select 1 from public.deliveries where order_id=o.id and status not in ('delivered','returned')) then perform public.commerce_enqueue('delivery_reconcile',o.id,'delivery-sweep:'||o.id||':'||bucket); end if;
    for op in select * from public.provider_operations where order_id=o.id and status in ('dispatching','pending','unknown') loop
      perform public.commerce_enqueue('operation_reconcile',o.id,'op-sweep:'||op.id||':'||bucket,now(),'{}',op.id);
      if op.created_at<now()-interval '5 minutes' and op.status in ('dispatching','unknown') then perform public.commerce_open_case(o.id,'uncertain:'||op.id,op.provider,case when op.provider='uber' then 'DELIVERY_BOOKING_UNCERTAIN' else 'PAYMENT_UNCERTAIN' end); end if;
    end loop;
  end loop;
end $$;
-- Supabase-only scheduling is explicitly installed after Vault secrets exist.
-- This migration remains usable in local PostgreSQL/PGlite without pg_cron/pg_net.
create function public.commerce_install_schedule() returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net') then raise exception 'Enable pg_cron and pg_net first'; end if;
  if to_regclass('vault.decrypted_secrets') is null then raise exception 'Vault required'; end if;
  execute $schedule$select cron.schedule('ruvon-orders-worker','30 seconds',$job$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='ruvon_worker_url'),headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='ruvon_worker_secret')),body := '{}'::jsonb,timeout_milliseconds := 25000);$job$)$schedule$;
end $$;
create function public.commerce_fail_order(p_order uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare o public.payment_orders;
begin
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order and flow_version=2 for update;
  if o.operational_status not in ('awaiting_payment','awaiting_merchant','confirming') then raise exception 'Automatic cancellation prohibited'; end if;
  update public.payment_orders set operational_status='cancelling',cancellation_reason=p_reason,version=version+1 where id=o.id;
  perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
  if not exists(select 1 from public.order_events where command_key='auto-cancel:'||o.id) then perform public.commerce_append_event(o.id,'auto-cancel:'||o.id,md5(p_reason),'worker','system',o.operational_status,p_reason); end if;
end $$;
create function public.commerce_process_inbox(p_event uuid,p_job uuid,p_token uuid,p_order uuid default null,p_error text default null,p_bind_only boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.background_jobs where id=p_job and reference_id=p_event and lease_token=p_token and lease_expires_at>now() and state='running' for update;
  if not found then raise exception 'Lease lost'; end if;
  if p_order is not null then update public.background_jobs set order_id=p_order where id=p_job; end if;
  if not p_bind_only then
    update public.external_events set state=case when p_error is null then 'processed' else 'quarantined' end,processing_error=p_error,processed_at=now() where id=p_event;
  end if;
end $$;
create function public.operations_command(p_order uuid,p_command uuid,p_version integer,p_action text,p_reason text,p_reference uuid default null,p_amount integer default null,p_allocation jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; previous public.order_events; h text;
begin
  if auth.uid() is null or (auth.jwt()->'app_metadata'->>'role') is distinct from 'operations_admin' then raise exception 'Named administrator required' using errcode='42501'; end if;
  if coalesce(length(trim(p_reason)),0)<3 then raise exception 'Reason required'; end if;
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order and flow_version=2 for update;
  h:=md5(jsonb_build_object('action',p_action,'reason',p_reason,'reference',p_reference,'amount',p_amount,'allocation',p_allocation)::text);
  select * into previous from public.order_events where command_key=p_command::text;
  if found then
    if previous.order_id<>o.id or previous.actor_id<>auth.uid()::text or previous.command_hash<>h then raise exception 'Command conflict' using errcode='23505'; end if;
    return previous.outcome;
  end if;
  if o.version<>p_version then raise exception 'Stale version' using errcode='40001'; end if;
  if p_action='retry' then
    perform 1 from public.provider_operations where id=p_reference and order_id=o.id;
    if not found then raise exception 'Operation not found'; end if;
    perform public.commerce_enqueue('operation_reconcile',o.id,'admin-reconcile:'||p_command,now(),'{}',p_reference);
  elsif p_action='refund' then
    perform public.commerce_refund_reserve(o.id,p_command,p_amount,p_allocation,p_reason,auth.uid()::text,'unknown');
    if o.settlement_status in ('released','bank_settlement_pending','settled') then perform public.commerce_open_case(o.id,'merchant-recovery:'||p_command,'recovery','POST_SETTLEMENT_RECOVERY'); end if;
  elsif p_action='cancel' then
    if o.picked_up_at is not null then perform public.commerce_open_case(o.id,'admin-cancel:'||p_command,'delivery','CANCELLATION_AFTER_PICKUP');
    else update public.payment_orders set operational_status='cancelling',cancellation_reason=p_reason,version=version+1 where id=o.id;perform public.commerce_enqueue('cancel_order',o.id,'admin-cancel:'||p_command);end if;
  elsif p_action='acknowledge' then
    update public.order_cases set state='acknowledged',acknowledged_at=now(),approval_actor=auth.uid()::text where id=p_reference and order_id=o.id and state='open';
    if not found then raise exception 'Open case not found'; end if;
  else raise exception 'Unsupported operational command'; end if;
  return public.commerce_append_event(o.id,p_command::text,h,'admin',auth.uid()::text,o.operational_status,p_reason,jsonb_build_object('action',p_action,'reference_id',p_reference,'amount',p_amount));
end $$;
revoke all on function public.operations_command(uuid,uuid,integer,text,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.operations_command(uuid,uuid,integer,text,text,uuid,integer,jsonb) to authenticated;
create function public.operations_resolve_case(p_order uuid,p_command uuid,p_version integer,p_reference uuid,p_resolution jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; previous public.order_events; h text; c public.order_cases; d public.deliveries; next_state text;
begin
  if auth.uid() is null or (auth.jwt()->'app_metadata'->>'role') is distinct from 'operations_admin' then raise exception 'Named administrator required' using errcode='42501'; end if;
  if coalesce(length(trim(p_reason)),0)<3 or coalesce(p_resolution->>'action','') not in ('resume','cancel','record_only') or coalesce(p_resolution->>'responsible_party','') not in ('unknown','merchant','ruvon','delivery_provider','customer') or coalesce(length(trim(p_resolution->>'summary')),0)<3 then raise exception 'Approved resolution required'; end if;
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order and flow_version=2 for update;
  h:=md5(jsonb_build_object('case',p_reference,'resolution',p_resolution,'reason',p_reason)::text);
  select * into previous from public.order_events where command_key=p_command::text;
  if found then
    if previous.order_id<>o.id or previous.actor_id<>auth.uid()::text or previous.command_hash<>h then raise exception 'Command conflict' using errcode='23505'; end if;
    return previous.outcome;
  end if;
  if o.version<>p_version then raise exception 'Stale version' using errcode='40001'; end if;
  select * into strict c from public.order_cases where id=p_reference and order_id=o.id and state<>'resolved' for update;
  update public.order_cases set state='resolved',responsible_party=p_resolution->>'responsible_party',resolution=p_resolution,approval_actor=auth.uid()::text,resolved_at=now() where id=c.id;
  if p_resolution->>'action'='resume' then
    if o.operational_status<>'manual_review' or exists(select 1 from public.order_cases where order_id=o.id and state<>'resolved') or exists(select 1 from public.provider_operations where order_id=o.id and status in ('dispatching','pending','unknown')) then raise exception 'Unresolved facts prevent recovery' using errcode='40001'; end if;
    select * into d from public.deliveries where order_id=o.id and direction='outbound';
    if exists(select 1 from public.deliveries where order_id=o.id and direction='return') then raise exception 'Return requires financial resolution' using errcode='40001'; end if;
    if o.payment_status='paid' and d.status='delivered' and (not o.requires_age_verification or d.verification_passed) then next_state:='delivered';
    elsif o.payment_status='paid' and d.status in ('pickup_complete','dropoff') then next_state:='in_delivery';
    elsif o.payment_status='paid' and d.status in ('pending','pickup') then next_state:=case when o.merchant_status='ready' then 'ready_for_pickup' else 'preparing' end;
    elsif o.payment_status='authorised' and o.merchant_status='accepted' then next_state:='confirming';
    elsif o.payment_status='authorised' and o.merchant_status='pending' and o.acceptance_deadline>now() then next_state:='awaiting_merchant';
    else raise exception 'No verified recovery stage' using errcode='40001'; end if;
    update public.payment_orders set operational_status=next_state,review_reason=null,review_previous_status=null,settlement_status=case when exists(select 1 from public.payment_splits where order_id=o.id) and not exists(select 1 from public.payment_splits where order_id=o.id and release_state<>'settled') then 'settled' else 'held' end,version=version+1 where id=o.id;
    if next_state='confirming' then perform public.commerce_enqueue('confirm_order',o.id,'resume-confirm:'||p_command); end if;
    if next_state='delivered' then
      update public.payment_splits set release_revision=release_revision+1 where order_id=o.id and release_state not in ('released','bank_settlement_pending','settled');
      perform public.commerce_enqueue('schedule_clearing',o.id,'resume-clearing:'||p_command);
    end if;
  elsif p_resolution->>'action'='cancel' then
    if o.operational_status in ('completed','cancelled') or exists(select 1 from public.deliveries where order_id=o.id and not(status in ('canceled','returned') or (direction='return' and status='delivered'))) then raise exception 'Physical delivery is not safely closed' using errcode='40001'; end if;
    update public.payment_orders set operational_status='cancelling',cancellation_reason=p_reason,version=version+1 where id=o.id;
    perform public.commerce_enqueue('cancel_order',o.id,'resolved-cancel:'||p_command);
  else update public.payment_orders set version=version+1 where id=o.id; end if;
  return public.commerce_append_event(o.id,p_command::text,h,'admin',auth.uid()::text,o.operational_status,p_reason,jsonb_build_object('case_id',c.id,'resolution',p_resolution));
end $$;
revoke all on function public.operations_resolve_case(uuid,uuid,integer,uuid,jsonb,text) from public,anon;
grant execute on function public.operations_resolve_case(uuid,uuid,integer,uuid,jsonb,text) to authenticated;
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('commerce_worker_health','commerce_checkout_ready','commerce_apply_operation','commerce_apply_delivery','commerce_deadline','commerce_close_cancellation','commerce_sweep','commerce_install_schedule','commerce_fail_order','commerce_process_inbox') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
