-- Phase 14: Utilities (agreement-focused) + handover notes on contracts + property meter counts + unit meter refs.
-- Run in Supabase SQL Editor after prior schema phases.

alter table public.properties
  add column if not exists electricity_meter_count integer not null default 0,
  add column if not exists water_meter_count integer not null default 0;

alter table public.properties
  drop constraint if exists properties_electricity_meter_count_check;
alter table public.properties
  add constraint properties_electricity_meter_count_check check (electricity_meter_count >= 0);

alter table public.properties
  drop constraint if exists properties_water_meter_count_check;
alter table public.properties
  add constraint properties_water_meter_count_check check (water_meter_count >= 0);

alter table public.units
  add column if not exists electricity_meter_ref text,
  add column if not exists water_meter_ref text;

alter table public.contracts
  add column if not exists utility_payment_type text not null default 'مستقل',
  add column if not exists utility_flat_amount_sar numeric(12,2),
  add column if not exists handover_notes text;

alter table public.contracts
  drop constraint if exists contracts_utility_payment_type_check;
alter table public.contracts
  add constraint contracts_utility_payment_type_check
  check (utility_payment_type in ('مستقل', 'مشترك', 'شامل', 'مقطوع'));

alter table public.contracts
  drop constraint if exists contracts_utility_flat_when_flatrate_check;
alter table public.contracts
  add constraint contracts_utility_flat_when_flatrate_check
  check (
    utility_payment_type <> 'مقطوع'
    or (utility_flat_amount_sar is not null and utility_flat_amount_sar > 0)
  );

alter table public.contracts
  drop constraint if exists contracts_utility_flat_null_when_not_flatrate_check;
alter table public.contracts
  add constraint contracts_utility_flat_null_when_not_flatrate_check
  check (
    utility_payment_type = 'مقطوع'
    or utility_flat_amount_sar is null
  );
