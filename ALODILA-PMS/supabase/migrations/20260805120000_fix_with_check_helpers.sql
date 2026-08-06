-- =============================================================================
-- 00601_fix_with_check_helpers.sql
-- Fix Soft RLS WITH CHECK parent lookups that recurse on the target table.
--
-- Root cause (local API validation 2026-08-05):
--   EXISTS (SELECT … FROM units u WHERE u.id = unit_id …) inside a contracts
--   policy is rewritten as u.id = contracts.unit_id and re-enters contracts RLS
--   → ERROR: infinite recursion detected in policy for relation "contracts"
--
--   Unqualified `company_id` inside parent EXISTS was also resolved to the
--   inner table (tautology u.company_id = u.company_id), weakening D8.
--
-- Fix: SECURITY DEFINER helpers take NEW column values as parameters
--      (no correlated target-table reference in the policy body).
-- Does NOT rewrite 006 V2 — additive repair only. Local + future clone apply.
-- =============================================================================

begin;

create or replace function public.parent_owner_in_company(p_owner_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_owner_id is null
    or exists (
      select 1 from public.owners o
      where o.id = p_owner_id
        and o.company_id = p_company_id
        and o.is_deleted = false
    );
$$;

create or replace function public.parent_property_in_company(p_property_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.properties p
    where p.id = p_property_id
      and p.company_id = p_company_id
      and p.is_deleted = false
  );
$$;

create or replace function public.parent_unit_in_company(p_unit_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.units u
    where u.id = p_unit_id
      and u.company_id = p_company_id
      and u.is_deleted = false
  );
$$;

create or replace function public.parent_tenant_in_company(p_tenant_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tenants t
    where t.id = p_tenant_id
      and t.company_id = p_company_id
      and t.is_deleted = false
  );
$$;

create or replace function public.parent_contract_in_company(p_contract_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.contracts c
    where c.id = p_contract_id
      and c.company_id = p_company_id
      and c.is_deleted = false
  );
$$;

create or replace function public.parent_invoice_in_company(p_invoice_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.invoices i
    where i.id = p_invoice_id
      and i.company_id = p_company_id
      and i.is_deleted = false
  );
$$;

-- Harden secondary helper: SECURITY DEFINER + jsonb (Production column type)
drop function if exists public.secondary_units_same_company(uuid, uuid[]);
create or replace function public.secondary_units_same_company(p_company_id uuid, p_secondary jsonb)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case
      when p_company_id is null then false
      when p_secondary is null
        or jsonb_typeof(p_secondary) is distinct from 'array'
        or jsonb_array_length(p_secondary) = 0 then true
      else not exists (
        select 1
        from jsonb_array_elements_text(p_secondary) as sid(unit_id_text)
        where sid.unit_id_text is null
           or sid.unit_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or not exists (
             select 1
             from public.units u
             where u.id = sid.unit_id_text::uuid
               and u.company_id = p_company_id
               and u.is_deleted = false
           )
      )
    end;
$$;

-- PROPERTIES
drop policy if exists properties_company_insert on public.properties;
create policy properties_company_insert on public.properties
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_owner_in_company(owner_crm_id, company_id)
);

drop policy if exists properties_company_update on public.properties;
create policy properties_company_update on public.properties
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_owner_in_company(owner_crm_id, company_id)
);

-- UNITS
drop policy if exists units_company_insert on public.units;
create policy units_company_insert on public.units
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_property_in_company(property_id, company_id)
);

drop policy if exists units_company_update on public.units;
create policy units_company_update on public.units
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_property_in_company(property_id, company_id)
);

-- METERS
drop policy if exists meters_company_insert on public.meters;
create policy meters_company_insert on public.meters
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_property_in_company(property_id, company_id)
);

drop policy if exists meters_company_update on public.meters;
create policy meters_company_update on public.meters
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_property_in_company(property_id, company_id)
);

-- CONTRACTS
drop policy if exists contracts_company_insert on public.contracts;
create policy contracts_company_insert on public.contracts
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_unit_in_company(unit_id, company_id)
  and public.parent_tenant_in_company(tenant_id, company_id)
  and public.secondary_units_same_company(company_id, secondary_unit_ids)
);

drop policy if exists contracts_company_update on public.contracts;
create policy contracts_company_update on public.contracts
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_unit_in_company(unit_id, company_id)
  and public.parent_tenant_in_company(tenant_id, company_id)
  and public.secondary_units_same_company(company_id, secondary_unit_ids)
);

-- INVOICES
drop policy if exists invoices_company_insert on public.invoices;
create policy invoices_company_insert on public.invoices
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_contract_in_company(contract_id, company_id)
);

drop policy if exists invoices_company_update on public.invoices;
create policy invoices_company_update on public.invoices
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_contract_in_company(contract_id, company_id)
);

-- PAYMENTS
drop policy if exists payments_company_insert on public.payments;
create policy payments_company_insert on public.payments
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_invoice_in_company(invoice_id, company_id)
);

drop policy if exists payments_company_update on public.payments;
create policy payments_company_update on public.payments
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_invoice_in_company(invoice_id, company_id)
);

-- MAINTENANCE
drop policy if exists maintenance_company_insert on public.maintenance_requests;
create policy maintenance_company_insert on public.maintenance_requests
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_unit_in_company(unit_id, company_id)
);

drop policy if exists maintenance_company_update on public.maintenance_requests;
create policy maintenance_company_update on public.maintenance_requests
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and public.parent_unit_in_company(unit_id, company_id)
);

grant execute on function public.parent_owner_in_company(uuid, uuid) to authenticated;
grant execute on function public.parent_property_in_company(uuid, uuid) to authenticated;
grant execute on function public.parent_unit_in_company(uuid, uuid) to authenticated;
grant execute on function public.parent_tenant_in_company(uuid, uuid) to authenticated;
grant execute on function public.parent_contract_in_company(uuid, uuid) to authenticated;
grant execute on function public.parent_invoice_in_company(uuid, uuid) to authenticated;
grant execute on function public.secondary_units_same_company(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Soft-delete via UPDATE requires NEW row to pass SELECT policies (Postgres).
-- Company SELECT must NOT require is_deleted=false; app lists still filter it.
-- Owner portal SELECT keeps is_deleted=false (read-only live data).
-- ---------------------------------------------------------------------------
drop policy if exists owners_company_select on public.owners;
create policy owners_company_select on public.owners
for select to authenticated
using (
  public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists tenants_company_select on public.tenants;
create policy tenants_company_select on public.tenants
for select to authenticated
using (
  public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists properties_company_select on public.properties;
create policy properties_company_select on public.properties
for select to authenticated
using (
  public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists units_company_select on public.units;
create policy units_company_select on public.units
for select to authenticated
using (
  public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists meters_company_select on public.meters;
create policy meters_company_select on public.meters
for select to authenticated
using (
  public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists contracts_company_select on public.contracts;
create policy contracts_company_select on public.contracts
for select to authenticated
using (
  public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists invoices_company_select on public.invoices;
create policy invoices_company_select on public.invoices
for select to authenticated
using (
  public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists payments_company_select on public.payments;
create policy payments_company_select on public.payments
for select to authenticated
using (
  public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists maintenance_company_select on public.maintenance_requests;
create policy maintenance_company_select on public.maintenance_requests
for select to authenticated
using (
  public.is_company_login()
  and public.company_matches(company_id)
);

commit;
