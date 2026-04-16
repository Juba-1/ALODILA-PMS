-- ALODILA-PMS Migration: PRD v2 alignment
-- Goal:
-- - Add created_at / updated_at to all operational tables
-- - Add updated_at trigger
-- - Make properties.maps_link optional
-- - Align contracts with PRD v2 (end_date required in canonical; added nullable here for safe migration)
-- - Remove fields not allowed by PRD v2 (invoices.vat_amount, maintenance_requests.requested_date)
--
-- NOTE ABOUT contracts.end_date:
-- This migration adds end_date as NULLABLE so it can run safely on existing rows.
-- After backfilling end_date for all rows, you may enforce NOT NULL.

begin;

-- 1) updated_at trigger function (idempotent)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) Add timestamps to all tables (idempotent)
alter table if exists public.properties
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.units
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.meters
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.tenants
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.contracts
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.invoices
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.payments
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.maintenance_requests
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- 3) PRD v2 column alignment

-- properties.maps_link becomes optional (PRD v2: optional URL)
alter table if exists public.properties
  alter column maps_link drop not null;

-- contracts: ejar_contract_number becomes optional; add end_date (nullable for safe migration); deposit default 0
alter table if exists public.contracts
  alter column ejar_contract_number drop not null;

alter table if exists public.contracts
  add column if not exists end_date date null;

alter table if exists public.contracts
  alter column deposit set default 0;

-- invoices: PRD v2 does NOT allow vat_amount column
alter table if exists public.invoices
  drop column if exists vat_amount;

-- maintenance_requests: PRD v2 does NOT include requested_date
alter table if exists public.maintenance_requests
  drop column if exists requested_date;

-- 4) Attach updated_at triggers (drop + recreate is simplest & idempotent)
drop trigger if exists set_updated_at_properties on public.properties;
create trigger set_updated_at_properties
before update on public.properties
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_units on public.units;
create trigger set_updated_at_units
before update on public.units
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_meters on public.meters;
create trigger set_updated_at_meters
before update on public.meters
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_tenants on public.tenants;
create trigger set_updated_at_tenants
before update on public.tenants
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_contracts on public.contracts;
create trigger set_updated_at_contracts
before update on public.contracts
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_invoices on public.invoices;
create trigger set_updated_at_invoices
before update on public.invoices
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_payments on public.payments;
create trigger set_updated_at_payments
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_maintenance_requests on public.maintenance_requests;
create trigger set_updated_at_maintenance_requests
before update on public.maintenance_requests
for each row execute function public.set_updated_at();

commit;

-- OPTIONAL (run only after you backfill contracts.end_date for all existing rows):
-- alter table public.contracts alter column end_date set not null;

