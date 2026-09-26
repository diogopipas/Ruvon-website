-- New signups provide a city only. Keep the legacy column for existing rows
-- and RPC compatibility; new rows store an empty string in it.
alter table public.leads drop constraint if exists leads_postcode_check;
