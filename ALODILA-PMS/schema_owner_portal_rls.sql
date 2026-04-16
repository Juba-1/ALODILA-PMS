-- Phase 10 / 12: Owner portal RLS (run after `owners`, `properties.owner_crm_id`, and JWT metadata exist).
-- JWT MUST resolve the same owner as DevLogin signUp:
--   signUp({ options: { data: { role: 'owner', owner_crm_id: '<uuid>' } } }) → user_metadata in the JWT.
-- Dashboard may instead set app_metadata — BOTH paths are supported below.
-- is_super_admin() is unchanged; helpers read request.jwt.claims (never use auth.jwt() per PRD).

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

-- Canonical owner CRM UUID from JWT (app_metadata then user_metadata; invalid → NULL).
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

-- Legacy name (Phase 13+): keep for older SQL / tools referencing current_owner_crm_id().
create or replace function public.current_owner_crm_id()
returns uuid
language sql
stable
as $$
  select public.current_owner_id();
$$;

-- PROPERTIES: owners may read rows linked to their CRM owner id
drop policy if exists properties_select_policy on public.properties;
create policy properties_select_policy
on public.properties
for select
to authenticated
using (
  public.is_super_admin()
  or (is_deleted = false and owner_id = auth.uid())
  or (
    public.is_owner_portal_user()
    and is_deleted = false
    and owner_crm_id is not null
    and owner_crm_id = public.current_owner_id()
  )
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
  or (
    public.is_owner_portal_user()
    and is_deleted = false
    and exists (
      select 1
      from public.properties p
      where p.id = public.units.property_id
        and p.is_deleted = false
        and p.owner_crm_id is not null
        and p.owner_crm_id = public.current_owner_id()
    )
  )
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
  or (
    public.is_owner_portal_user()
    and is_deleted = false
    and exists (
      select 1
      from public.properties p
      where p.id = public.meters.property_id
        and p.is_deleted = false
        and p.owner_crm_id is not null
        and p.owner_crm_id = public.current_owner_id()
    )
  )
);

-- TENANTS (read-only path for owners: tenants tied to contracts on their properties)
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

-- ---------------------------------------------------------------------------
-- Phase 11.2 doc: «owner_view_own_units / owner_view_own_contracts»
-- The app does not use those policy names; owner reads are implemented as:
--   units_select_policy          → owner branch: unit.property.owner_crm_id = current_owner_id()
--   contracts_select_policy      → owner branch: same join via units → properties
--   invoices_select_policy       → contract → unit → property owner_crm_id
--   payments_select_policy       → invoice → contract → unit → property owner_crm_id
--   maintenance_select_policy    → unit → property owner_crm_id
-- Apply this file (or merge) so owners can run the graph fetches in src/lib/db/ownerPortal.js.
-- No extra policy is required if the above policies are already deployed.
-- ---------------------------------------------------------------------------
--
-- Security audit (owner isolation): every owner SELECT branch requires
--   p.owner_crm_id = public.current_owner_id()
-- where current_owner_id() is derived ONLY from request.jwt.claims (app_metadata /
-- user_metadata). National ID is never compared in RLS; onboarding maps NID → owners.id
-- once, then JWT carries owner_crm_id. The app additionally calls
-- assertOwnerCrmIdMatchesSession() in ownerPortal.js so client-supplied ownerCrmId cannot
-- diverge from the signed-in user before queries run (RLS remains authoritative).
-- ---------------------------------------------------------------------------
