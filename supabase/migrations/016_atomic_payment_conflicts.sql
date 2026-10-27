-- Applied migrations 001-015 remain unchanged. No tables, data imports or launch gates change.
-- Replace only the guarded transition function; existing financial facts remain intact.
create or replace function public.commerce_apply_operation(p_operation uuid,p_job uuid,p_token uuid,p_fact jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  -- Preserve the contradictory fact and its review hold in the same fenced transaction.
  -- A crash between independent RPCs must never lose the required operator review.
  if target='unknown' and (
    right(coalesce(p_fact->>'error_class',''),9)='_conflict'
    or p_fact->>'error_class' in ('unexpected_capture','multiple_resources')
  ) then
    perform public.commerce_open_case(o.id,'provider-conflict:'||op.id,'provider','PROVIDER_STATE_CONFLICT');
    select * into strict o from public.payment_orders where id=o.id;
  end if;
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

revoke all on function public.commerce_apply_operation(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_apply_operation(uuid,uuid,uuid,jsonb) to service_role;
