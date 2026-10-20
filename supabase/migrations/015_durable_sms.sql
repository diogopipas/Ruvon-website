-- Applied migrations 001-014 remain unchanged. SMS has no assumed creation replay guarantee.
create function public.commerce_schedule_sms_reads(p_notification uuid) returns void
language plpgsql security definer set search_path='' as $$
declare n public.notifications; delay_seconds integer;
begin
  select * into strict n from public.notifications where id=p_notification and channel='sms';
  if n.first_dispatch_at is null or n.status in ('delivered','failed','skipped') then return; end if;
  foreach delay_seconds in array array[30,120,300,900,3600,86400] loop
    perform public.commerce_enqueue('notification_reconcile',n.order_id,'sms-read:'||n.id||':'||delay_seconds,
      n.first_dispatch_at+make_interval(secs=>delay_seconds),jsonb_build_object('after_seconds',delay_seconds),n.id);
  end loop;
end $$;
revoke all on function public.commerce_schedule_sms_reads(uuid) from public,anon,authenticated,service_role;

create or replace function public.commerce_dispatch_notification(p_id uuid,p_job uuid,p_token uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.notifications; j public.background_jobs; o public.payment_orders;
begin
  select * into strict j from public.background_jobs where id=p_job and state='running' and lease_token=p_token and lease_expires_at>now() for update;
  select * into strict n from public.notifications where id=p_id and job_id=j.id and order_id=j.order_id for update;
  if n.status in ('sent','delivered','delayed','failed','skipped') then return jsonb_build_object('allowed',false); end if;
  if n.request is not null and n.request is distinct from p_request then raise exception 'Notification request is immutable'; end if;
  -- This check survives process crashes, unknown responses, new workers and expired leases.
  if n.channel='sms' and n.first_dispatch_at is not null then
    update public.notifications set status='unknown',last_error='sms_reconciliation_required' where id=n.id;
    return jsonb_build_object('allowed',false,'reason','already_dispatched');
  end if;
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
  if n.channel='email' and n.retry_safe_until<=now() then
    update public.notifications set status='unknown',last_error='email_reconciliation_required' where id=n.id;
    return jsonb_build_object('allowed',false,'reason','replay_expired');
  end if;
  if n.request is null then
    if jsonb_typeof(p_request->'to') is distinct from 'array' or jsonb_array_length(p_request->'to')<>1 or coalesce(length(p_request->>'text'),0)=0 then raise exception 'Invalid notification request'; end if;
    if n.channel='sms' and (
      coalesce(p_request->>'account','')!~'^AC[0-9a-fA-F]{32}$' or
      coalesce(p_request->'to'->>0,'')!~'^\+[1-9][0-9]{7,14}$' or
      ((p_request->>'from' is not null)=(p_request->>'service' is not null)) or
      (p_request->>'from' is not null and (p_request->>'from')!~'^\+[1-9][0-9]{7,14}$') or
      (p_request->>'service' is not null and (p_request->>'service')!~'^MG[0-9a-fA-F]{32}$') or
      length(p_request->>'text')>1000 or
      coalesce(p_request->>'callback','')!~'^https://[^/]+/api/webhooks/twilio\?' or
      position('notification_id='||n.id::text in coalesce(p_request->>'callback',''))=0
    ) then raise exception 'Invalid SMS request'; end if;
    update public.notifications set request=p_request where id=n.id;
  end if;
  update public.notifications set status='sending',attempts=attempts+1,first_dispatch_at=coalesce(first_dispatch_at,now()),
    retry_safe_until=case when channel='email' then coalesce(retry_safe_until,now()+interval '23 hours') else null end
    where id=n.id returning * into n;
  if n.channel='sms' then perform public.commerce_schedule_sms_reads(n.id); end if;
  return jsonb_build_object('allowed',true,'request',n.request);
end $$;

create function public.commerce_apply_sms_fact(p_job uuid,p_token uuid,p_notification uuid,p_fact jsonb,p_event uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare j public.background_jobs; n public.notifications; e public.external_events; next_status text; prior_rank integer; next_rank integer;
begin
  select * into strict j from public.background_jobs where id=p_job and state='running' and lease_token=p_token and lease_expires_at>now() for update;
  select * into strict n from public.notifications where id=p_notification and channel='sms' for update;
  if j.kind='external_event' then
    select * into strict e from public.external_events where id=p_event and id=j.reference_id and provider='twilio' and verified for update;
    if e.state<>'pending' then return; end if;
    if e.payload->>'notification_id' is distinct from n.id::text or e.account is distinct from p_fact->>'account' or
      e.environment is distinct from n.environment or e.resource_id is distinct from p_fact->>'id' or e.payload->>'quarantine_reason' is not null then raise exception 'SMS inbox conflict'; end if;
  elsif p_event is not null or j.order_id is distinct from n.order_id or not (j.id=n.job_id or (j.kind='notification_reconcile' and j.reference_id=n.id)) then
    raise exception 'SMS job conflict';
  end if;
  if n.first_dispatch_at is null or n.request is null or n.status='skipped' or
    coalesce(p_fact->>'id','')!~'^SM[0-9a-fA-F]{32}$' or
    (n.provider_id is not null and n.provider_id is distinct from p_fact->>'id') or
    n.request->>'account' is distinct from p_fact->>'account' or n.request->'to'->>0 is distinct from p_fact->>'to' or
    (n.request->>'from' is not null and n.request->>'from' is distinct from p_fact->>'from') or
    (n.request->>'service' is not null and n.request->>'service' is distinct from p_fact->>'service') or
    not (coalesce(p_fact->>'status','')=any(array['accepted','scheduled','queued','sending','sent','delivered','failed','undelivered','canceled'])) then raise exception 'SMS provider identity conflict'; end if;
  next_status:=p_fact->>'status';
  prior_rank:=case n.provider_status when 'accepted' then 0 when 'scheduled' then 0 when 'queued' then 1 when 'sending' then 2 when 'sent' then 3 when 'delivered' then 4 when 'failed' then 4 when 'undelivered' then 4 when 'canceled' then 4 else -1 end;
  next_rank:=case next_status when 'accepted' then 0 when 'scheduled' then 0 when 'queued' then 1 when 'sending' then 2 when 'sent' then 3 else 4 end;
  if prior_rank=4 and next_rank=4 and n.provider_status<>next_status then
    update public.notifications set last_error='sms_provider_state_conflict' where id=n.id;
    if p_event is not null then update public.external_events set state='quarantined',processing_error='PROVIDER_STATE_CONFLICT',processed_at=now() where id=e.id; end if;
    return;
  end if;
  if next_rank>=prior_rank then
    update public.notifications set provider_id=p_fact->>'id',provider_status=next_status,
      status=case when next_status='delivered' then 'delivered' when next_status in ('failed','undelivered','canceled') then 'failed' when first_dispatch_at<=now()-interval '24 hours' then 'unknown' else 'sent' end,
      sent_at=coalesce(sent_at,now()),delivered_at=case when next_status='delivered' then coalesce(delivered_at,now()) else delivered_at end,
      last_error=case when next_status in ('failed','undelivered','canceled') then 'sms_'||coalesce(nullif(p_fact->>'error_code',''),'delivery_failed') when next_rank<4 and first_dispatch_at<=now()-interval '24 hours' then 'sms_delivery_unconfirmed' else null end
      where id=n.id;
  end if;
  if p_event is not null then update public.external_events set state='processed',processing_error=null,processed_at=now() where id=e.id; end if;
end $$;

create function public.commerce_sms_unconfirmed(p_job uuid,p_token uuid,p_notification uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.background_jobs; n public.notifications;
begin
  select * into strict j from public.background_jobs where id=p_job and kind='notification_reconcile' and reference_id=p_notification and state='running' and lease_token=p_token and lease_expires_at>now() and due_at<=now() for update;
  select * into strict n from public.notifications where id=p_notification and channel='sms' and order_id=j.order_id for update;
  if n.first_dispatch_at<=now()-interval '5 minutes' and n.provider_id is null and n.status in ('sending','unknown') then
    update public.notifications set status='unknown',last_error='sms_reconciliation_required' where id=n.id;
  end if;
end $$;
revoke all on function public.commerce_apply_sms_fact(uuid,uuid,uuid,jsonb,uuid),public.commerce_sms_unconfirmed(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.commerce_apply_sms_fact(uuid,uuid,uuid,jsonb,uuid),public.commerce_sms_unconfirmed(uuid,uuid,uuid) to service_role;

-- Preserve the existing recovery policy and append SMS read reconstruction.
create or replace function public.commerce_sweep() returns void
language plpgsql security definer set search_path='' as $$
declare o public.payment_orders; op public.provider_operations; c public.order_cases; d public.deliveries; e public.order_events; r public.refunds; inbox public.external_events; sms public.notifications;
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
  -- Reconstruct only the six original read jobs. Never reset failed/leased work or create another SMS intent.
  for sms in select * from public.notifications where channel='sms' and first_dispatch_at is not null and status in ('sending','unknown','sent') loop
    perform public.commerce_schedule_sms_reads(sms.id);
  end loop;
end $$;
