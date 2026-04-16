-- ALODILA-PMS canonical schema.sql (PRD v2)
-- Supabase (PostgreSQL) schema with strict RLS and soft-delete.
--
-- PRD v2 RULES:
-- - STRICT RTL product, but DB-side: stick to exact dictionary.
-- - NO HARD DELETES: use is_deleted = false in queries.
-- - All operational tables: id, is_deleted, created_at, updated_at.
-- - is_super_admin(): MUST use current_setting('request.jwt.claims', true) (never auth.jwt()).

create extension if not exists pgcrypto;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'super_admin';
$$;

-- Owner portal (JWT app_metadata.role = 'owner' + owner_crm_id): see schema_owner_portal_rls.sql
-- Owner zero-touch onboarding RPC: schema_owner_onboarding.sql

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================
-- 1) Core: Properties
-- =========================
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,

  name text not null,
  type text not null check (type in ('Residential', 'Commercial', 'Mixed')),
  total_units_capacity integer not null check (total_units_capacity >= 0),
  deed_number text null,
  maps_link text null,
  owner_id uuid not null references auth.users(id)
);

drop trigger if exists set_updated_at_properties on public.properties;
create trigger set_updated_at_properties
before update on public.properties
for each row execute function public.set_updated_at();

-- =========================
-- 2) Units (MUST be created BEFORE meters)
-- =========================
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,

  property_id uuid not null references public.properties(id),
  unit_name text not null,
  type text not null check (type in ('Residential', 'Commercial', 'Mixed')),
  target_rent_value numeric(12,2) not null check (target_rent_value >= 0)
);

drop trigger if exists set_updated_at_units on public.units;
create trigger set_updated_at_units
before update on public.units
for each row execute function public.set_updated_at();

-- =========================
-- 3) Meter Pools
-- =========================
create table if not exists public.meters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,

  property_id uuid not null references public.properties(id),
  meter_type text not null check (lower(meter_type) in ('electricity', 'water')),
  pool_quantity integer not null check (pool_quantity >= 0),
  unit_id uuid null references public.units(id)
);

drop trigger if exists set_updated_at_meters on public.meters;
create trigger set_updated_at_meters
before update on public.meters
for each row execute function public.set_updated_at();

-- =========================
-- 4) Tenants (CRM)
-- =========================
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,

  national_id_or_cr text not null,
  full_name text not null,
  tenant_type text not null,
  phone text not null,
  national_address text not null,
  compliance_index numeric(10,4) not null default 0 check (compliance_index >= 0),

  unique (national_id_or_cr)
);

drop trigger if exists set_updated_at_tenants on public.tenants;
create trigger set_updated_at_tenants
before update on public.tenants
for each row execute function public.set_updated_at();

-- =========================
-- 5) Contracts
-- =========================
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,

  unit_id uuid not null references public.units(id),
  tenant_id uuid not null references public.tenants(id),
  ejar_contract_number text null,
  start_date date not null,
  end_date date not null,
  actual_handover_date date null,
  contract_value numeric(12,2) not null check (contract_value >= 0),
  deposit numeric(12,2) not null default 0 check (deposit >= 0),
  billing_cycle text not null,
  status text not null
);

drop trigger if exists set_updated_at_contracts on public.contracts;
create trigger set_updated_at_contracts
before update on public.contracts
for each row execute function public.set_updated_at();

-- =========================
-- 6) Finance: Invoices
-- =========================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,

  contract_id uuid not null references public.contracts(id),
  due_date date not null,
  subtotal_amount numeric(12,2) not null check (subtotal_amount >= 0),
  vat_applicable boolean not null default false,
  total_amount numeric(12,2) not null check (total_amount >= 0)
);

drop trigger if exists set_updated_at_invoices on public.invoices;
create trigger set_updated_at_invoices
before update on public.invoices
for each row execute function public.set_updated_at();

-- =========================
-- 7) Finance: Payments (partial)
-- =========================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,

  invoice_id uuid not null references public.invoices(id),
  payment_date date not null,
  amount numeric(12,2) not null check (amount >= 0)
);

drop trigger if exists set_updated_at_payments on public.payments;
create trigger set_updated_at_payments
before update on public.payments
for each row execute function public.set_updated_at();

-- =========================
-- 8) Maintenance
-- =========================
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,

  unit_id uuid not null references public.units(id),
  description text not null,
  cost_amount numeric(12,2) not null check (cost_amount >= 0),
  status text not null
);

drop trigger if exists set_updated_at_maintenance_requests on public.maintenance_requests;
create trigger set_updated_at_maintenance_requests
before update on public.maintenance_requests
for each row execute function public.set_updated_at();

-- =========================
-- Indexes (RLS join performance)
-- =========================
create index if not exists properties_owner_id_idx on public.properties(owner_id);
create index if not exists meters_property_id_idx on public.meters(property_id);
create index if not exists meters_unit_id_idx on public.meters(unit_id);
create index if not exists units_property_id_idx on public.units(property_id);
create index if not exists contracts_unit_id_idx on public.contracts(unit_id);
create index if not exists contracts_tenant_id_idx on public.contracts(tenant_id);
create index if not exists invoices_contract_id_idx on public.invoices(contract_id);
create index if not exists payments_invoice_id_idx on public.payments(invoice_id);
create index if not exists maintenance_unit_id_idx on public.maintenance_requests(unit_id);

-- =========================
-- RLS Policies
-- =========================
alter table public.properties enable row level security;
alter table public.meters enable row level security;
alter table public.units enable row level security;
alter table public.tenants enable row level security;
alter table public.contracts enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance_requests enable row level security;

-- No DELETE policies are defined to enforce "no hard deletes" from the app side.

-- PROPERTIES
drop policy if exists properties_select_policy on public.properties;
create policy properties_select_policy
on public.properties
for select
to authenticated
using (
  public.is_super_admin()
  or (is_deleted = false and owner_id = auth.uid())
);

drop policy if exists properties_insert_policy on public.properties;
create policy properties_insert_policy
on public.properties
for insert
to authenticated
with check (
  public.is_super_admin()
  and is_deleted = false
);

drop policy if exists properties_update_policy on public.properties;
create policy properties_update_policy
on public.properties
for update
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);

-- METERS
drop policy if exists meters_select_policy on public.meters;
create policy meters_select_policy
on public.meters
for select
to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and exists (
      select 1
      from public.properties p
      where p.id = public.meters.property_id
        and p.owner_id = auth.uid()
        and p.is_deleted = false
    )
  )
);

drop policy if exists meters_insert_policy on public.meters;
create policy meters_insert_policy
on public.meters
for insert
to authenticated
with check (
  public.is_super_admin()
  and is_deleted = false
);

drop policy if exists meters_update_policy on public.meters;
create policy meters_update_policy
on public.meters
for update
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);

-- UNITS
drop policy if exists units_select_policy on public.units;
create policy units_select_policy
on public.units
for select
to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and exists (
      select 1
      from public.properties p
      where p.id = public.units.property_id
        and p.owner_id = auth.uid()
        and p.is_deleted = false
    )
  )
);

drop policy if exists units_insert_policy on public.units;
create policy units_insert_policy
on public.units
for insert
to authenticated
with check (
  public.is_super_admin()
  and is_deleted = false
);

drop policy if exists units_update_policy on public.units;
create policy units_update_policy
on public.units
for update
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);

-- TENANTS
drop policy if exists tenants_select_policy on public.tenants;
create policy tenants_select_policy
on public.tenants
for select
to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and exists (
      select 1
      from public.contracts c
      join public.units u on u.id = c.unit_id
      join public.properties p on p.id = u.property_id
      where c.tenant_id = public.tenants.id
        and c.is_deleted = false
        and u.is_deleted = false
        and p.is_deleted = false
        and p.owner_id = auth.uid()
    )
  )
);

drop policy if exists tenants_insert_policy on public.tenants;
create policy tenants_insert_policy
on public.tenants
for insert
to authenticated
with check (
  public.is_super_admin()
  and is_deleted = false
);

drop policy if exists tenants_update_policy on public.tenants;
create policy tenants_update_policy
on public.tenants
for update
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);

-- CONTRACTS
drop policy if exists contracts_select_policy on public.contracts;
create policy contracts_select_policy
on public.contracts
for select
to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = public.contracts.unit_id
        and p.owner_id = auth.uid()
        and p.is_deleted = false
        and u.is_deleted = false
    )
  )
);

drop policy if exists contracts_insert_policy on public.contracts;
create policy contracts_insert_policy
on public.contracts
for insert
to authenticated
with check (
  public.is_super_admin()
  and is_deleted = false
);

drop policy if exists contracts_update_policy on public.contracts;
create policy contracts_update_policy
on public.contracts
for update
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);

-- INVOICES
drop policy if exists invoices_select_policy on public.invoices;
create policy invoices_select_policy
on public.invoices
for select
to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and exists (
      select 1
      from public.contracts c
      join public.units u on u.id = c.unit_id
      join public.properties p on p.id = u.property_id
      where c.id = public.invoices.contract_id
        and c.is_deleted = false
        and u.is_deleted = false
        and p.is_deleted = false
        and p.owner_id = auth.uid()
    )
  )
);

drop policy if exists invoices_insert_policy on public.invoices;
create policy invoices_insert_policy
on public.invoices
for insert
to authenticated
with check (
  public.is_super_admin()
  and is_deleted = false
);

drop policy if exists invoices_update_policy on public.invoices;
create policy invoices_update_policy
on public.invoices
for update
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);

-- PAYMENTS
drop policy if exists payments_select_policy on public.payments;
create policy payments_select_policy
on public.payments
for select
to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and exists (
      select 1
      from public.invoices i
      join public.contracts c on c.id = i.contract_id
      join public.units u on u.id = c.unit_id
      join public.properties p on p.id = u.property_id
      where i.id = public.payments.invoice_id
        and i.is_deleted = false
        and c.is_deleted = false
        and u.is_deleted = false
        and p.is_deleted = false
        and p.owner_id = auth.uid()
    )
  )
);

drop policy if exists payments_insert_policy on public.payments;
create policy payments_insert_policy
on public.payments
for insert
to authenticated
with check (
  public.is_super_admin()
  and is_deleted = false
);

drop policy if exists payments_update_policy on public.payments;
create policy payments_update_policy
on public.payments
for update
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);

-- MAINTENANCE
drop policy if exists maintenance_select_policy on public.maintenance_requests;
create policy maintenance_select_policy
on public.maintenance_requests
for select
to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = public.maintenance_requests.unit_id
        and u.is_deleted = false
        and p.owner_id = auth.uid()
        and p.is_deleted = false
    )
  )
);

drop policy if exists maintenance_insert_policy on public.maintenance_requests;
create policy maintenance_insert_policy
on public.maintenance_requests
for insert
to authenticated
with check (
  public.is_super_admin()
  and is_deleted = false
);

drop policy if exists maintenance_update_policy on public.maintenance_requests;
create policy maintenance_update_policy
on public.maintenance_requests
for update
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);

-- Phase 14 (utilities agreement + handover notes + meter refs): apply `schema_phase14_utilities_handover.sql` in Supabase.
