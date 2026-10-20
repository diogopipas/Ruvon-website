-- 006–011 have been applied to the hosted sandbox. Keep them immutable.
alter table public.stores add column operations_version integer not null default 0 check(operations_version>=0);

create function public.commerce_store_control_version() returns trigger language plpgsql set search_path='' as $$
begin
  new.operations_version:=old.operations_version;
  if (new.enabled,new.paused,new.pause_reason) is distinct from (old.enabled,old.paused,old.pause_reason) then
    new.operations_version:=old.operations_version+1;
  end if;
  return new;
end $$;
create trigger store_control_version before update on public.stores for each row execute function public.commerce_store_control_version();
revoke all on function public.commerce_store_control_version() from public,anon,authenticated,service_role;

create table public.operations_audit (
  command_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  action text not null check(action in ('pause_store','resume_store','retry_event')),
  target_id uuid not null,
  reason text not null check(length(trim(reason)) between 3 and 400),
  request_hash text not null,
  outcome jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.operations_audit enable row level security;
revoke all on public.operations_audit from public,anon,authenticated,service_role;
grant select on public.operations_audit to service_role;
create trigger operations_audit_immutable before update or delete on public.operations_audit for each row execute function public.commerce_immutable();
create index operations_audit_recent on public.operations_audit(created_at desc);
create index jobs_failed_recent on public.background_jobs(created_at desc) where state='failed';
create index external_quarantined_recent on public.external_events(received_at desc) where state='quarantined';
create index notifications_failed_recent on public.notifications(created_at desc) where status in ('failed','unknown','delayed');

-- Return an explicit, bounded operational DTO, never requests, payloads or contacts.
create function public.operations_monitor(p_environment text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or (auth.jwt()->'app_metadata'->>'role') is distinct from 'operations_admin' then
    raise exception 'Named administrator required' using errcode='42501';
  end if;
  if p_environment is null or p_environment not in ('sandbox','live') then raise exception 'Invalid environment' using errcode='22023'; end if;
  return jsonb_build_object(
    'checked_at',now(),
    'worker',(select jsonb_build_object('last_started_at',last_started_at,'last_success_at',last_success_at,'last_error',left(last_error,80),'jobs_processed',jobs_processed,'healthy',last_success_at>now()-interval '120 seconds' and last_success_at<=now()+interval '5 seconds') from public.worker_health where name='orders'),
    'stores',(select coalesce(jsonb_agg(x order by x.name),'[]') from (
      select id,name,enabled,paused,pause_reason,operations_version,heartbeat_at,
        coalesce(heartbeat_at>now()-interval '90 seconds' and heartbeat_at<=now()+interval '5 seconds',false) as connected
      from public.stores order by name,id limit 100
    ) x),
    'jobs',(select coalesce(jsonb_agg(x order by x.due_at),'[]') from (
      select j.id,j.order_id,j.kind,j.state,j.attempts,j.due_at,j.lease_expires_at,left(j.last_error,80) as last_error,
        (j.kind='external_event' and j.state='failed' and exists(select 1 from public.external_events e where e.id=j.reference_id and e.environment=p_environment and e.state='pending' and e.verified)) as can_retry
      from public.background_jobs j left join public.payment_orders o on o.id=j.order_id
      where (j.order_id is null or o.environment=p_environment) and
        (j.state='failed' or (j.state='running' and j.lease_expires_at<=now()) or (j.state='pending' and j.due_at<now()-interval '5 minutes'))
      order by j.due_at,j.id limit 100
    ) x),
    'events',(select coalesce(jsonb_agg(x order by x.received_at),'[]') from (
      select id,provider,event_identity,resource_id,state,left(processing_error,80) as processing_error,received_at,processed_at
      from public.external_events where environment=p_environment and (state='quarantined' or (state='pending' and received_at<now()-interval '5 minutes'))
      order by received_at,id limit 100
    ) x),
    'operations',(select coalesce(jsonb_agg(x order by x.created_at),'[]') from (
      select id,order_id,provider,kind,status,provider_resource_id,left(error_class,80) as error_class,created_at
      from public.provider_operations where environment=p_environment and (status='unknown' or (status='dispatching' and created_at<now()-interval '5 minutes'))
      order by created_at,id limit 100
    ) x),
    'notifications',(select coalesce(jsonb_agg(x order by x.created_at),'[]') from (
      select id,order_id,channel,purpose,status,attempts,left(last_error,80) as last_error,created_at
      from public.notifications where environment=p_environment and status in ('failed','unknown','delayed')
      order by created_at,id limit 100
    ) x),
    'capabilities',(select coalesce(jsonb_agg(x order by x.capability),'[]') from (
      select capability,expires_at,expires_at>now() as verified from public.commerce_capabilities where environment=p_environment
    ) x),
    'audit',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from (
      select command_id,actor_id,action,target_id,reason,created_at from public.operations_audit order by created_at desc,command_id limit 30
    ) x)
  );
end $$;
revoke all on function public.operations_monitor(text) from public,anon,authenticated,service_role;
grant execute on function public.operations_monitor(text) to authenticated;

-- The only global retry reuses a failed inbox job whose verified event is still
-- pending. Quarantine, active leases and new financial mutations are excluded.
create function public.operations_control(p_command uuid,p_action text,p_target uuid,p_version integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.operations_audit; s public.stores; j public.background_jobs; e public.external_events; h text; result jsonb;
begin
  if auth.uid() is null or (auth.jwt()->'app_metadata'->>'role') is distinct from 'operations_admin' then
    raise exception 'Named administrator required' using errcode='42501';
  end if;
  if p_command is null or p_target is null or p_action is null or p_action not in ('pause_store','resume_store','retry_event') or p_version is null or p_version<0 or coalesce(length(trim(p_reason)),0) not between 3 and 400 then
    raise exception 'Invalid operational command' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command::text,0));
  h:=md5(jsonb_build_object('action',p_action,'target',p_target,'version',p_version,'reason',p_reason)::text);
  select * into previous from public.operations_audit where command_id=p_command;
  if found then
    if previous.actor_id<>auth.uid() or previous.request_hash<>h then raise exception 'Command conflict' using errcode='23505'; end if;
    return previous.outcome;
  end if;
  if p_action in ('pause_store','resume_store') then
    select * into strict s from public.stores where id=p_target for update;
    if s.operations_version<>p_version then raise exception 'Stale store version' using errcode='40001'; end if;
    if p_action='resume_store' and (not s.enabled or s.heartbeat_at is null or s.heartbeat_at<=now()-interval '90 seconds' or s.heartbeat_at>now()+interval '5 seconds') then
      raise exception 'Store must be enabled and connected before resuming' using errcode='40001';
    end if;
    update public.stores set paused=(p_action='pause_store'),pause_reason=case when p_action='pause_store' then 'OPERATIONS_PAUSED' else null end where id=s.id returning * into s;
    result:=jsonb_build_object('id',s.id,'version',s.operations_version,'paused',s.paused);
  else
    select * into strict j from public.background_jobs where id=p_target for update;
    if j.state<>'failed' or j.attempts<>p_version then raise exception 'Job changed' using errcode='40001'; end if;
    if j.kind<>'external_event' then raise exception 'Use order reconciliation for provider operations' using errcode='22023'; end if;
    select * into strict e from public.external_events where id=j.reference_id for update;
    if not e.verified or e.state<>'pending' then raise exception 'Event is not eligible for retry' using errcode='40001'; end if;
    update public.background_jobs set state='pending',due_at=now(),lease_token=null,lease_expires_at=null,last_error=null,completed_at=null where id=j.id;
    result:=jsonb_build_object('id',j.id,'state','pending','attempts',j.attempts);
  end if;
  insert into public.operations_audit(command_id,actor_id,action,target_id,reason,request_hash,outcome)
    values(p_command,auth.uid(),p_action,p_target,trim(p_reason),h,result);
  return result;
end $$;
revoke all on function public.operations_control(uuid,text,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.operations_control(uuid,text,uuid,integer,text) to authenticated;
