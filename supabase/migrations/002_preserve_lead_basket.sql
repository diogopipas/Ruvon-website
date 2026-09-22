-- A city-only signup after checkout must not erase the saved purchase intent.
-- Apply after 001_jola.sql. Safe to run again on an existing deployment.
create or replace function public.capture_lead(lead_data jsonb, order_data jsonb default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare incoming public.leads;
begin
  incoming := jsonb_populate_record(null::public.leads, lead_data);
  if order_data is not null then
    if (order_data->>'session_id')::uuid <> incoming.session_id then
      raise exception 'Session mismatch';
    end if;
    perform public.save_simulated_order(order_data);
    update public.simulated_orders set converted_to_lead = true where session_id = incoming.session_id;
  end if;
  insert into public.leads select (incoming).*
  on conflict (session_id) do update set
    email = excluded.email, phone = excluded.phone,
    city = excluded.city, postcode = excluded.postcode,
    basket_total = case when jsonb_array_length(excluded.basket_items) > 0
      then excluded.basket_total else public.leads.basket_total end,
    basket_items = case when jsonb_array_length(excluded.basket_items) > 0
      then excluded.basket_items else public.leads.basket_items end,
    consent_at = excluded.consent_at,
    utm_source = coalesce(excluded.utm_source, public.leads.utm_source),
    utm_medium = coalesce(excluded.utm_medium, public.leads.utm_medium),
    utm_campaign = coalesce(excluded.utm_campaign, public.leads.utm_campaign),
    utm_content = coalesce(excluded.utm_content, public.leads.utm_content);
end;
$$;
revoke all on function public.capture_lead(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.capture_lead(jsonb, jsonb) to service_role;
