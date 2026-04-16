-- =============================================================================
-- Phase 13: Owner portal RLS — financial & operational tables (idempotent)
-- Run in Supabase SQL Editor after auth JWT includes owner_crm_id (app or user metadata).
--
-- 1) public.current_owner_id() — canonical UUID from JWT (same logic as legacy name).
-- 2) public.current_owner_crm_id() — thin alias so older policies keep working.
-- 3) SELECT policies on tenants, contracts, invoices, payments, maintenance_requests
--    so owner users read rows only when linked units/properties match that UUID.
--
-- Requires: public.is_owner_portal_user() (see schema_owner_portal_rls.sql) OR
-- define it below if missing.
-- =============================================================================

create or replace function public.current_owner_id()
returns uuid
language plpgsql
stable
as $$
declare
  v text;
begin
  v := trim(coalesce(
    current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,owner_crm_id}',
    current_setting('request.jwt.claims', true)::jsonb #>> '{user_metadata,owner_crm_id}',
    current_setting('request.jwt.claims', true)::jsonb ->> 'owner_crm_id',
    ''
  ));
  if v is null or v = '' then
    return null;
  end if;
  begin
    return v::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;
end;
$$;

-- Legacy name: delegate to current_owner_id() so properties/units patches stay consistent.
create or replace function public.current_owner_crm_id()
returns uuid
language sql
stable
as $$
  select public.current_owner_id();
$$;

create or replace function public.is_owner_portal_user()
returns boolean
language sql
stable
as $$
  select lower(trim(coalesce(
    nullif(trim(coalesce(
      current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}',
      ''
    )), ''),
    nullif(trim(coalesce(
      current_setting('request.jwt.claims', true)::jsonb #>> '{user_metadata,role}',
      ''
    )), ''),
    ''
  ))) = 'owner';
$$;

-- ---------------------------------------------------------------------------
-- TENANTS (owners: tenants tied to contracts on their CRM-linked properties)
-- ---------------------------------------------------------------------------
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
  or (
    public.is_owner_portal_user()
    and is_deleted = false
    and exists (
      select 1
      from public.contracts c
      join public.units u on u.id = c.unit_id
      join public.properties p on p.id = u.property_id
      where c.tenant_id = public.tenants.id
        and c.is_deleted = false
        and u.is_deleted = false
        and p.is_deleted = false
        and p.owner_crm_id is not null
        and p.owner_crm_id = public.current_owner_id()
    )
  )
);

-- ---------------------------------------------------------------------------
-- CONTRACTS
-- ---------------------------------------------------------------------------
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
  or (
    public.is_owner_portal_user()
    and is_deleted = false
    and exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = public.contracts.unit_id
        and u.is_deleted = false
        and p.is_deleted = false
        and p.owner_crm_id is not null
        and p.owner_crm_id = public.current_owner_id()
    )
  )
);

-- ---------------------------------------------------------------------------
-- INVOICES
-- ---------------------------------------------------------------------------
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
  or (
    public.is_owner_portal_user()
    and is_deleted = false
    and exists (
      select 1
      from public.contracts c
      join public.units u on u.id = c.unit_id
      join public.properties p on p.id = u.property_id
      where c.id = public.invoices.contract_id
        and c.is_deleted = false
        and u.is_deleted = false
        and p.is_deleted = false
        and p.owner_crm_id is not null
        and p.owner_crm_id = public.current_owner_id()
    )
  )
);

-- ---------------------------------------------------------------------------
-- PAYMENTS
-- ---------------------------------------------------------------------------
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
  or (
    public.is_owner_portal_user()
    and is_deleted = false
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
        and p.owner_crm_id is not null
        and p.owner_crm_id = public.current_owner_id()
    )
  )
);

-- ---------------------------------------------------------------------------
-- MAINTENANCE
-- ---------------------------------------------------------------------------
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
  or (
    public.is_owner_portal_user()
    and is_deleted = false
    and exists (
      select 1
      from public.units u
      join public.properties p on p.id = u.property_id
      where u.id = public.maintenance_requests.unit_id
        and u.is_deleted = false
        and p.is_deleted = false
        and p.owner_crm_id is not null
        and p.owner_crm_id = public.current_owner_id()
    )
  )
);
