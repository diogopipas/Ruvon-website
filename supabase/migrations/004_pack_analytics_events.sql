-- Pack browsing and customization emit these events. The original check
-- constraint predates packs and rejects them with SQLSTATE 23514.
begin;

alter table public.analytics_events
  drop constraint if exists analytics_events_name_check;

alter table public.analytics_events
  add constraint analytics_events_name_check check (name in (
    'landing_view',
    'order_cta_clicked',
    'category_clicked',
    'product_viewed',
    'product_added',
    'product_removed',
    'cart_opened',
    'checkout_started',
    'location_entered',
    'waitlist_submitted',
    'share_clicked',
    'pack_group_selected',
    'pack_options_changed'
  ));

commit;
