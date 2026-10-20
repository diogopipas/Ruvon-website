-- Deadlines are guards on persisted facts, not authority granted by a queue's
-- due_at. Existing two-argument callers remain compatible during deployment.
create function public.commerce_policy_timestamp(p_value text) returns timestamptz
language plpgsql stable strict set search_path='' as $$
declare result timestamptz;
begin
  if p_value !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then return null; end if;
  result := p_value::timestamptz;
  if isfinite(result) then return result; end if;
  return null;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $$;
revoke all on function public.commerce_policy_timestamp(text) from public,anon,authenticated,service_role;

-- Uber's outbound canceled -> returned progression accompanies a separate
-- provider-created return leg. Neither fact is customer delivery or payout.
create or replace function public.commerce_apply_delivery(p_order uuid,p_fact jsonb,p_job uuid,p_token uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; d public.deliveries; parent public.deliveries; incoming_status text; before_state text; return_id text; relationship_key text;
begin
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order and flow_version=2 for update;
  perform 1 from public.background_jobs where id=p_job and order_id=o.id and lease_token=p_token and lease_expires_at>now() and state='running' for update;
  if not found then raise exception 'Lease lost' using errcode='40001'; end if;
  incoming_status:=p_fact->>'status'; before_state:=o.operational_status;
  if incoming_status is null or incoming_status not in ('pending','pickup','pickup_complete','dropoff','delivered','canceled','returned') then raise exception 'Unknown delivery status'; end if;
  select * into d from public.deliveries where order_id=o.id and provider_delivery_id=p_fact->>'id' for update;
  if not found then
    if coalesce(p_fact->>'id','') !~ '^ret_[A-Za-z0-9_-]+$' then raise exception 'Invalid return identity'; end if;
    select * into strict parent from public.deliveries where order_id=o.id and direction='outbound' and provider_delivery_id=p_fact->>'parent_id';
    insert into public.deliveries(order_id,direction,parent_delivery_id,provider_delivery_id,provider_account,environment,raw_status,status)
      values(o.id,'return',parent.id,p_fact->>'id',parent.provider_account,parent.environment,incoming_status,incoming_status) returning * into d;
  end if;
  return_id:=nullif(p_fact->>'return_id','');
  if d.direction='return' and p_fact->>'parent_id' is not null and not exists(
    select 1 from public.deliveries where id=d.parent_delivery_id and provider_delivery_id=p_fact->>'parent_id') then
    perform public.commerce_open_case(o.id,'delivery-parent-conflict:'||d.id,'delivery','PROVIDER_STATE_CONFLICT'); return;
  end if;
  if return_id is not null and (d.direction<>'outbound' or return_id !~ '^ret_[A-Za-z0-9_-]+$') then raise exception 'Invalid return relationship'; end if;
  if return_id is null and d.direction='outbound' then
    select provider_delivery_id into return_id from public.deliveries where parent_delivery_id=d.id and direction='return' order by created_at limit 1;
    if return_id is null then
      select metadata->>'return_id' into return_id from public.order_events where order_id=o.id and metadata->>'kind'='return_relationship' and metadata->>'parent_id'=d.provider_delivery_id order by sequence limit 1;
    end if;
  end if;
  if (d.status in ('delivered','returned') and d.status<>incoming_status) or
    (d.status='canceled' and d.status<>incoming_status and not (d.direction='outbound' and incoming_status='returned' and return_id is not null)) or
    (d.status in ('pickup_complete','dropoff') and incoming_status in ('pending','pickup')) or
    (d.status='dropoff' and incoming_status='pickup_complete') or
    (o.operational_status='cancelled' and incoming_status in ('pickup_complete','dropoff','delivered')) then
    perform public.commerce_open_case(o.id,'delivery-conflict:'||d.id,'delivery','PROVIDER_STATE_CONFLICT'); return;
  end if;
  update public.deliveries set status=incoming_status,raw_status=incoming_status,eta=coalesce((p_fact->>'eta')::timestamptz,eta),updated_at=now(),
    picked_up_at=case when incoming_status in ('pickup_complete','dropoff','delivered') then coalesce(picked_up_at,now()) else picked_up_at end,
    delivered_at=case when incoming_status='delivered' then coalesce(delivered_at,now()) else delivered_at end,
    returned_at=case when incoming_status='returned' then coalesce(returned_at,now()) else returned_at end,
    verification_passed=coalesce((p_fact->>'verification_passed')::boolean,verification_passed),
    verification_at=case when p_fact ? 'verification_passed' then now() else verification_at end where id=d.id;
  if d.direction='return' then
    update public.payment_orders set operational_status=case when operational_status in ('manual_review','completed','cancelled') then operational_status when incoming_status='delivered' then 'returned' else 'returning' end,
      settlement_status=case when review_reason is not null or settlement_status='disputed' then 'disputed' else 'held' end,version=version+1 where id=o.id;
    perform public.commerce_enqueue('return_overdue',o.id,'return-overdue:'||d.id,d.created_at+interval '45 minutes');
    if o.operational_status in ('completed','cancelled') then perform public.commerce_open_case(o.id,'return-after-closure:'||d.id,'return','RETURN_AFTER_CLOSURE'); end if;
  elsif incoming_status in ('pickup_complete','dropoff','delivered') then
    if o.payment_status<>'paid' then perform public.commerce_open_case(o.id,'unpaid-pickup:'||d.id,'payment','PROVIDER_STATE_CONFLICT'); end if;
    perform public.commerce_inventory(o.id,'consume');
    update public.payment_orders set operational_status=case when operational_status='manual_review' then operational_status when incoming_status='delivered' then 'delivered' else 'in_delivery' end,
      picked_up_at=coalesce(picked_up_at,now()),delivered_at=case when incoming_status='delivered' then coalesce(delivered_at,now()) else delivered_at end,version=version+1 where id=o.id and operational_status not in ('completed','cancelled');
    if incoming_status='delivered' then
      if o.requires_age_verification and (p_fact->>'verification_passed')::boolean is distinct from true then perform public.commerce_open_case(o.id,'verification:'||d.id,'delivery','AGE_VERIFICATION_EVIDENCE_MISSING');
      else perform public.commerce_enqueue('schedule_clearing',o.id,'clearing:'||o.id); end if;
    end if;
  elsif incoming_status in ('canceled','returned') then
    if return_id is not null then
      update public.payment_orders set operational_status=case when operational_status='manual_review' then operational_status
        when exists(select 1 from public.deliveries where order_id=o.id and direction='return' and provider_delivery_id=return_id and status='delivered') then 'returned' else 'returning' end,
        settlement_status=case when review_reason is not null or settlement_status='disputed' then 'disputed' else 'held' end,version=version+1 where id=o.id;
      relationship_key:='delivery-return:'||d.id||':'||return_id;
      if not exists(select 1 from public.order_events where command_key=relationship_key) then
        perform public.commerce_append_event(o.id,relationship_key,md5(return_id),'provider','uber',(select operational_status from public.payment_orders where id=o.id),null,
          jsonb_build_object('kind','return_relationship','return_id',return_id,'parent_id',d.provider_delivery_id));
      end if;
      perform public.commerce_enqueue('delivery_reconcile',o.id,'return-reconcile:'||return_id,now(),jsonb_build_object('delivery_id',return_id,'parent_id',d.provider_delivery_id));
    elsif incoming_status='returned' then
      perform public.commerce_open_case(o.id,'return-identity:'||d.id,'delivery','RETURN_IDENTITY_MISSING');
    elsif o.picked_up_at is null and o.operational_status<>'manual_review' then
      update public.payment_orders set operational_status='cancelling',cancellation_reason='DELIVERY_CANCELLED',version=version+1 where id=o.id;
      perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
    elsif o.picked_up_at is not null then
      perform public.commerce_open_case(o.id,'cancel-after-pickup:'||d.id,'delivery','UNSAFE_DELIVERY_CANCELLATION');
    end if;
  end if;
  if not exists(select 1 from public.order_events where command_key='delivery:'||d.id||':'||incoming_status) then
    perform public.commerce_append_event(o.id,'delivery:'||d.id||':'||incoming_status,md5(incoming_status),'provider','uber',
      case when exists(select 1 from public.order_cases where order_id=o.id and state<>'resolved') then (select operational_status from public.payment_orders where id=o.id) else before_state end,
      null,jsonb_build_object('direction',d.direction,'provider_delivery_id',d.provider_delivery_id));
  end if;
end $$;

create or replace function public.commerce_deadline(p_order uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; started timestamptz; acted boolean:=false;
begin
  if p_kind not in ('merchant_timeout','checkout_expiry','preparation_overdue','return_overdue') then
    raise exception 'Unsupported deadline' using errcode='22023';
  end if;
  perform set_config('ruvon.command','on',true);
  select * into strict o from public.payment_orders where id=p_order and flow_version=2 for update;
  if p_kind='merchant_timeout' and o.operational_status='awaiting_merchant' and o.acceptance_deadline<=now() then
    update public.payment_orders set operational_status='cancelling',merchant_status='timed_out',cancellation_reason='MERCHANT_TIMEOUT',version=version+1 where id=o.id;
    perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
    if (select count(*) from public.payment_orders where store_id=o.store_id and merchant_status='timed_out' and created_at>now()-interval '1 day')>=3 then
      update public.stores set paused=true,pause_reason='REPEATED_TIMEOUTS' where id=o.store_id;
    end if;
    acted:=true;
  elsif p_kind='checkout_expiry' and o.operational_status='awaiting_payment' and o.reservation_expires_at<=now() then
    update public.payment_orders set operational_status='cancelling',cancellation_reason='CHECKOUT_EXPIRED',version=version+1 where id=o.id;
    perform public.commerce_enqueue('cancel_order',o.id,'cancel:'||o.id);
    acted:=true;
  elsif p_kind='preparation_overdue' and o.operational_status='preparing' then
    -- Preparation permission begins with confirmed booking, not acceptance.
    select created_at into started from public.deliveries where order_id=o.id and direction='outbound';
    if started+interval '20 minutes'<=now() then
      perform public.commerce_open_case(o.id,'prep-overdue:'||o.id,'merchant','MERCHANT_DELAY');
      acted:=true;
    end if;
  elsif p_kind='return_overdue' and (o.operational_status='returning' or
      (o.operational_status='manual_review' and (o.review_previous_status='returning' or exists(
        select 1 from public.deliveries where order_id=o.id and direction='return')))) then
    -- A delivered return remains a return even while a financial case is open.
    if not exists(select 1 from public.deliveries where order_id=o.id and direction='return' and status in ('delivered','returned')) then
      select min(t) into started from (
        select created_at t from public.deliveries where order_id=o.id and direction='return'
        union all
        select created_at t from public.order_events where order_id=o.id and after_state='returning' and before_state<>after_state
      ) facts;
      if started+interval '45 minutes'<=now() then
        perform public.commerce_open_case(o.id,'return-overdue:'||o.id,'delivery','RETURN_OVERDUE');
        acted:=true;
      end if;
    end if;
  end if;
  if acted and not exists(select 1 from public.order_events where command_key='deadline:'||p_kind||':'||o.id) then
    perform public.commerce_append_event(o.id,'deadline:'||p_kind||':'||o.id,md5(p_kind),'worker','system',
      case when p_kind in ('preparation_overdue','return_overdue') then (select operational_status from public.payment_orders where id=o.id) else o.operational_status end,p_kind);
  end if;
end $$;

-- Only a worker that just reconciled an outbound delivery may evaluate these
-- policies. A failed GET, lost lease or more recent physical fact cannot be
-- interpreted as evidence that a delivery is safe to cancel or refund.
create function public.commerce_delivery_deadline(p_job uuid,p_token uuid,p_delivery text,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare j public.background_jobs; o public.payment_orders; d public.deliveries; due timestamptz; reason text; event_key text;
begin
  select * into j from public.background_jobs where id=p_job and state='running' and lease_token=p_token and lease_expires_at>now();
  if not found then raise exception 'Lease lost' using errcode='40001'; end if;
  select * into strict o from public.payment_orders where id=j.order_id and flow_version=2 for update;
  select * into j from public.background_jobs where id=p_job and state='running' and lease_token=p_token and lease_expires_at>now() for update;
  if not found then raise exception 'Lease lost' using errcode='40001'; end if;
  if j.kind not in ('courier_check','delivery_overdue') then raise exception 'Invalid delivery deadline job' using errcode='22023'; end if;
  select * into strict d from public.deliveries where order_id=o.id and direction='outbound' and provider_delivery_id=p_delivery for update;
  if d.status<>p_status or d.status in ('delivered','canceled','returned') or
    o.operational_status not in ('preparing','ready_for_pickup','in_delivery') then return; end if;
  if j.kind='courier_check' then
    if d.status<>'pending' or o.picked_up_at is not null or d.picked_up_at is not null or d.created_at+interval '10 minutes'>now() then return; end if;
    reason:='NO_COURIER_ASSIGNED';
  else
    due:=coalesce(public.commerce_policy_timestamp(o.quote_snapshot->>'eta'),d.eta)+interval '15 minutes';
    if due is null or due>now() then return; end if;
    reason:='DELIVERY_OVERDUE';
  end if;
  event_key:='deadline:'||j.kind||':'||d.id;
  if exists(select 1 from public.order_events where command_key=event_key) then return; end if;
  -- Until the account cancellation contract is verified, review holds clearing
  -- and preserves the active trip/payment. No cancellation or refund is invented.
  perform public.commerce_open_case(o.id,event_key,'delivery',reason,
    jsonb_build_array(jsonb_build_object('delivery_id',d.id,'status',d.status,'checked_at',now())));
  perform public.commerce_append_event(o.id,event_key,md5(reason),'worker','system','manual_review',reason);
end $$;
revoke all on function public.commerce_delivery_deadline(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.commerce_delivery_deadline(uuid,uuid,text,text) to service_role;

create or replace function public.commerce_sweep() returns void
language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; op public.provider_operations; c public.order_cases; d public.deliveries; e public.order_events; r public.refunds; inbox public.external_events;
  reminder text; bucket text:=floor(extract(epoch from now())/60)::text; started timestamptz; due timestamptz;
begin
  for o in select * from public.payment_orders where flow_version=2 and current_attempt_id is not null and operational_status not in ('completed','cancelled') loop
    if o.operational_status='awaiting_payment' then
      perform public.commerce_enqueue('checkout_expiry',o.id,'checkout-expiry:'||o.current_attempt_id,o.reservation_expires_at);
      if o.reservation_expires_at<=now() then
        perform public.commerce_enqueue('checkout_expiry',o.id,'checkout-expiry-sweep:'||o.id||':'||bucket);
      elsif o.payment_status='authorisation_pending' then
        perform public.commerce_enqueue('authorise',o.id,'authorise:'||o.current_attempt_id,now(),'{}',o.current_attempt_id);
      end if;
    end if;
    if o.operational_status='awaiting_merchant' then
      perform public.commerce_enqueue('merchant_notify',o.id,'merchant-email:'||o.current_attempt_id,o.acceptance_deadline-interval '3 minutes',jsonb_build_object('channel','email'));
      perform public.commerce_enqueue('merchant_notify',o.id,'merchant-sms:'||o.current_attempt_id,o.acceptance_deadline-interval '2 minutes',jsonb_build_object('channel','sms'));
      perform public.commerce_enqueue('merchant_timeout',o.id,'merchant-timeout:'||o.current_attempt_id,o.acceptance_deadline);
      if o.acceptance_deadline<=now() then perform public.commerce_enqueue('merchant_timeout',o.id,'timeout-sweep:'||o.id||':'||bucket); end if;
    end if;
    if o.operational_status='cancelling' then perform public.commerce_enqueue('cancel_order',o.id,'cancel-sweep:'||o.id||':'||bucket); end if;
    if o.operational_status='confirming' and o.payment_status='authorised' then perform public.commerce_enqueue('confirm_order',o.id,'confirm-sweep:'||o.id||':'||bucket); end if;
    if o.operational_status='confirming' and o.payment_status='paid' then perform public.commerce_enqueue('book_delivery',o.id,'book-sweep:'||o.id||':'||bucket); end if;
    if o.operational_status='delivered' and o.review_reason is null then
      perform public.commerce_enqueue('schedule_clearing',o.id,'clearing:'||o.id);
      select min(resolved_at)+interval '1 day' into due from public.provider_operations where order_id=o.id and kind='split_schedule' and status='succeeded';
      if due is not null then perform public.commerce_enqueue('settlement_reconcile',o.id,'settlement:'||o.id,due); end if;
    end if;
    for d in select * from public.deliveries where order_id=o.id loop
      if d.status not in ('delivered','returned','canceled') or
        (d.direction='outbound' and d.status in ('canceled','returned') and
          o.operational_status in ('returning','manual_review') and
          not exists(select 1 from public.deliveries where order_id=o.id and direction='return')) then
        perform public.commerce_enqueue('delivery_reconcile',o.id,'delivery-sweep:'||d.id||':'||bucket,now(),jsonb_build_object('delivery_id',d.provider_delivery_id));
      end if;
      if d.direction='outbound' and o.operational_status='preparing' then
        perform public.commerce_enqueue('preparation_reminder',o.id,'prep-remind:'||o.id,d.created_at+interval '10 minutes');
        perform public.commerce_enqueue('preparation_overdue',o.id,'prep-overdue:'||o.id,d.created_at+interval '20 minutes');
        if d.created_at+interval '20 minutes'<=now() then perform public.commerce_enqueue('preparation_overdue',o.id,'prep-sweep:'||o.id||':'||bucket); end if;
      end if;
      if d.direction='outbound' and d.status='pending' and o.picked_up_at is null and o.operational_status in ('preparing','ready_for_pickup') then
        perform public.commerce_enqueue('courier_check',o.id,'courier-check:'||o.id,d.created_at+interval '10 minutes');
        if d.created_at+interval '10 minutes'<=now() then perform public.commerce_enqueue('courier_check',o.id,'courier-sweep:'||d.id||':'||bucket); end if;
      end if;
      if d.direction='outbound' and d.status not in ('delivered','returned','canceled') and o.operational_status in ('preparing','ready_for_pickup','in_delivery') then
        due:=coalesce(public.commerce_policy_timestamp(o.quote_snapshot->>'eta'),d.eta)+interval '15 minutes';
        if due is not null then
          perform public.commerce_enqueue('delivery_overdue',o.id,'delivery-overdue:'||d.id,due);
          if due<=now() then perform public.commerce_enqueue('delivery_overdue',o.id,'eta-sweep:'||d.id||':'||bucket); end if;
        end if;
      end if;
    end loop;
    if o.operational_status='returning' or (o.operational_status='manual_review' and (o.review_previous_status='returning' or exists(select 1 from public.deliveries where order_id=o.id and direction='return'))) then
      if not exists(select 1 from public.deliveries where order_id=o.id and direction='return' and status in ('delivered','returned')) then
        select min(t) into started from (
          select created_at t from public.deliveries where order_id=o.id and direction='return'
          union all select created_at t from public.order_events where order_id=o.id and after_state='returning' and before_state<>after_state
        ) facts;
        if started is not null and not exists(select 1 from public.order_cases where case_key='return-overdue:'||o.id) then
          perform public.commerce_enqueue('return_overdue',o.id,'return-policy:'||o.id,started+interval '45 minutes');
          if started+interval '45 minutes'<=now() then perform public.commerce_enqueue('return_overdue',o.id,'return-sweep:'||o.id||':'||bucket); end if;
        end if;
      end if;
    end if;
  end loop;
  -- Financial recovery also applies after fulfilment becomes terminal.
  for op in select * from public.provider_operations where status in ('dispatching','pending','unknown') loop
    perform public.commerce_enqueue('operation_reconcile',op.order_id,'op-sweep:'||op.id||':'||bucket,now(),'{}',op.id);
    if op.created_at<now()-interval '5 minutes' and op.status in ('dispatching','unknown') then
      perform public.commerce_open_case(op.order_id,'uncertain:'||op.id,op.provider,case when op.provider='uber' then 'DELIVERY_BOOKING_UNCERTAIN' else 'PAYMENT_UNCERTAIN' end);
    end if;
  end loop;
  for r in select * from public.refunds where status in ('requested','processing','unknown') loop
    perform public.commerce_enqueue('refund',r.order_id,'refund:'||r.id,now(),'{}',r.id);
  end loop;
  for inbox in select * from public.external_events where verified and state='pending' and not exists(select 1 from public.background_jobs where job_key='inbox:'||external_events.id) loop
    perform public.commerce_enqueue('external_event',null,'inbox:'||inbox.id,now(),'{}',inbox.id);
  end loop;
  -- Reuse the exact event/channel identity. Existing failed jobs and leases are
  -- never reset, and sending/unknown notifications never gain another key.
  -- Return identities come only from verified provider facts recorded by the
  -- transition service. Reconstruct the same read, even while review continues.
  for e in select ev.* from public.order_events ev join public.payment_orders po on po.id=ev.order_id where po.flow_version=2 and
    po.operational_status in ('returning','manual_review') and ev.metadata->>'kind'='return_relationship' and
    not exists(select 1 from public.deliveries where order_id=po.id and provider_delivery_id=ev.metadata->>'return_id') loop
    perform public.commerce_enqueue('delivery_reconcile',e.order_id,'return-reconcile:'||(e.metadata->>'return_id'),e.created_at,
      jsonb_build_object('delivery_id',e.metadata->>'return_id','parent_id',e.metadata->>'parent_id'));
  end loop;
  for e in select ev.* from public.order_events ev join public.payment_orders po on po.id=ev.order_id where po.flow_version=2 and (
    (ev.after_state=po.operational_status and ev.after_state<>ev.before_state and
      ev.after_state in ('awaiting_merchant','confirming','preparing','ready_for_pickup','in_delivery','delivered','cancelling','cancelled','returning','returned','manual_review') and
      ((po.recipient_email is not null and not exists(select 1 from public.background_jobs where job_key='customer-email:'||ev.id)) or
        (ev.after_state='preparing' and not exists(select 1 from public.background_jobs where job_key='merchant-prepare:'||ev.id)))) or
    (ev.metadata->>'kind'='refund' and ev.metadata->>'outcome'='succeeded' and po.recipient_email is not null and
      not exists(select 1 from public.background_jobs where job_key='refund-email:'||ev.id))) loop
    select * into strict o from public.payment_orders where id=e.order_id;
    if e.after_state=o.operational_status and e.after_state<>e.before_state then
      if o.recipient_email is not null then perform public.commerce_enqueue('customer_update',o.id,'customer-email:'||e.id,e.created_at,jsonb_build_object('state',e.after_state),e.id); end if;
      if e.after_state='preparing' then perform public.commerce_enqueue('merchant_preparation',o.id,'merchant-prepare:'||e.id,e.created_at); end if;
    end if;
    if e.metadata->>'kind'='refund' and e.metadata->>'outcome'='succeeded' and o.recipient_email is not null then
      perform public.commerce_enqueue('customer_refund',o.id,'refund-email:'||e.id,e.created_at,'{}',e.id);
    end if;
  end loop;
  for c in select * from public.order_cases where state='open' loop
    perform public.commerce_enqueue('operator_alert',c.order_id,'case-email:'||c.id,c.created_at,jsonb_build_object('channel','email'),c.id);
    perform public.commerce_enqueue('operator_alert',c.order_id,'case-sms:'||c.id,c.created_at+interval '5 minutes',jsonb_build_object('channel','sms'),c.id);
    if c.created_at<=now()-interval '30 minutes' then
      reminder:=floor(extract(epoch from (now()-c.created_at))/1800)::text;
      perform public.commerce_enqueue('operator_alert',c.order_id,'case-reminder-email:'||c.id||':'||reminder,now(),jsonb_build_object('channel','email'),c.id);
      perform public.commerce_enqueue('operator_alert',c.order_id,'case-reminder-sms:'||c.id||':'||reminder,now()+interval '5 minutes',jsonb_build_object('channel','sms'),c.id);
    end if;
  end loop;
end $$;
