-- =============================================================================
-- 001_baseline_pms_schema.sql
-- Local Supabase baseline: PMS tables that exist BEFORE Packages 1–5.
-- Does NOT rewrite Package/006 history — fills the missing pre-Sprint-3 schema.
-- Auth roles/schema provided by local Supabase; do not recreate auth.users.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Stub replaced by 006 V2
create or replace function public.is_super_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  ) = 'super_admin';
$$;

-- Owners CRM
create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  full_name text not null,
  national_id text not null,
  phone text null,
  unique (national_id)
);

drop trigger if exists set_updated_at_owners on public.owners;
create trigger set_updated_at_owners
before update on public.owners
for each row execute function public.set_updated_at();

-- Companies (Sprint 1)
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  name text not null,
  slug text not null,
  status text not null default 'active',
  auth_user_id uuid null references auth.users (id) on delete set null,
  notes text null,
  constraint companies_name_nonempty_check check (char_length(trim(name)) > 0),
  constraint companies_slug_format_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint companies_status_check check (status in ('active', 'suspended', 'provisioning')),
  constraint companies_slug_key unique (slug),
  constraint companies_auth_user_id_key unique (auth_user_id)
);

create index if not exists companies_is_deleted_idx on public.companies (is_deleted);
create index if not exists companies_status_idx on public.companies (status);

drop trigger if exists set_updated_at_companies on public.companies;
create trigger set_updated_at_companies
before update on public.companies
for each row execute function public.set_updated_at();

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
  owner_id uuid not null references auth.users(id),
  owner_crm_id uuid null references public.owners(id)
);

drop trigger if exists set_updated_at_properties on public.properties;
create trigger set_updated_at_properties
before update on public.properties
for each row execute function public.set_updated_at();

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
  status text not null,
  secondary_unit_ids jsonb not null default '[]'::jsonb
);

drop trigger if exists set_updated_at_contracts on public.contracts;
create trigger set_updated_at_contracts
before update on public.contracts
for each row execute function public.set_updated_at();

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

create index if not exists properties_owner_id_idx on public.properties(owner_id);
create index if not exists meters_property_id_idx on public.meters(property_id);
create index if not exists meters_unit_id_idx on public.meters(unit_id);
create index if not exists units_property_id_idx on public.units(property_id);
create index if not exists contracts_unit_id_idx on public.contracts(unit_id);
create index if not exists contracts_tenant_id_idx on public.contracts(tenant_id);
create index if not exists invoices_contract_id_idx on public.invoices(contract_id);
create index if not exists payments_invoice_id_idx on public.payments(invoice_id);
create index if not exists maintenance_unit_id_idx on public.maintenance_requests(unit_id);

-- RLS baseline (006 V2 rewrites SELECT names; preserves SA insert/update + owners SA ALL)
alter table public.companies enable row level security;
alter table public.owners enable row level security;
alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table public.meters enable row level security;
alter table public.tenants enable row level security;
alter table public.contracts enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance_requests enable row level security;

drop policy if exists companies_select_policy on public.companies;
create policy companies_select_policy on public.companies
for select to authenticated using (public.is_super_admin());
drop policy if exists companies_insert_policy on public.companies;
create policy companies_insert_policy on public.companies
for insert to authenticated with check (public.is_super_admin() and is_deleted = false);
drop policy if exists companies_update_policy on public.companies;
create policy companies_update_policy on public.companies
for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists owners_super_admin_policy on public.owners;
create policy owners_super_admin_policy on public.owners
for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists tenants_select_policy on public.tenants;
create policy tenants_select_policy on public.tenants for select to authenticated using (public.is_super_admin());
drop policy if exists owner_view_own_properties on public.properties;
create policy owner_view_own_properties on public.properties for select to authenticated using (public.is_super_admin());
drop policy if exists owner_view_own_units on public.units;
create policy owner_view_own_units on public.units for select to authenticated using (public.is_super_admin());
drop policy if exists units_select_policy on public.units;
create policy units_select_policy on public.units for select to authenticated using (public.is_super_admin());
drop policy if exists meters_select_policy on public.meters;
create policy meters_select_policy on public.meters for select to authenticated using (public.is_super_admin());
drop policy if exists contracts_select_policy on public.contracts;
create policy contracts_select_policy on public.contracts for select to authenticated using (public.is_super_admin());
drop policy if exists invoices_select_policy on public.invoices;
create policy invoices_select_policy on public.invoices for select to authenticated using (public.is_super_admin());
drop policy if exists payments_select_policy on public.payments;
create policy payments_select_policy on public.payments for select to authenticated using (public.is_super_admin());
drop policy if exists maintenance_select_policy on public.maintenance_requests;
create policy maintenance_select_policy on public.maintenance_requests for select to authenticated using (public.is_super_admin());

drop policy if exists tenants_insert_policy on public.tenants;
create policy tenants_insert_policy on public.tenants for insert to authenticated with check (public.is_super_admin() and is_deleted = false);
drop policy if exists tenants_update_policy on public.tenants;
create policy tenants_update_policy on public.tenants for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists properties_insert_policy on public.properties;
create policy properties_insert_policy on public.properties for insert to authenticated with check (public.is_super_admin() and is_deleted = false);
drop policy if exists properties_update_policy on public.properties;
create policy properties_update_policy on public.properties for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists units_insert_policy on public.units;
create policy units_insert_policy on public.units for insert to authenticated with check (public.is_super_admin() and is_deleted = false);
drop policy if exists units_update_policy on public.units;
create policy units_update_policy on public.units for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists meters_insert_policy on public.meters;
create policy meters_insert_policy on public.meters for insert to authenticated with check (public.is_super_admin() and is_deleted = false);
drop policy if exists meters_update_policy on public.meters;
create policy meters_update_policy on public.meters for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists contracts_insert_policy on public.contracts;
create policy contracts_insert_policy on public.contracts for insert to authenticated with check (public.is_super_admin() and is_deleted = false);
drop policy if exists contracts_update_policy on public.contracts;
create policy contracts_update_policy on public.contracts for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists invoices_insert_policy on public.invoices;
create policy invoices_insert_policy on public.invoices for insert to authenticated with check (public.is_super_admin() and is_deleted = false);
drop policy if exists invoices_update_policy on public.invoices;
create policy invoices_update_policy on public.invoices for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists payments_insert_policy on public.payments;
create policy payments_insert_policy on public.payments for insert to authenticated with check (public.is_super_admin() and is_deleted = false);
drop policy if exists payments_update_policy on public.payments;
create policy payments_update_policy on public.payments for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists maintenance_insert_policy on public.maintenance_requests;
create policy maintenance_insert_policy on public.maintenance_requests for insert to authenticated with check (public.is_super_admin() and is_deleted = false);
drop policy if exists maintenance_update_policy on public.maintenance_requests;
create policy maintenance_update_policy on public.maintenance_requests for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- Expose to Data API roles (local platform)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;

-- Seed companies required by Package preconditions (ALODILA fixed UUID)
insert into public.companies (id, name, slug, status, notes, is_deleted)
values (
  'a1000000-a10d-4000-8000-000000000001'::uuid,
  'ALODILA',
  'alodila',
  'active',
  'Baseline seed for local Soft RLS replay',
  false
)
on conflict (id) do nothing;
