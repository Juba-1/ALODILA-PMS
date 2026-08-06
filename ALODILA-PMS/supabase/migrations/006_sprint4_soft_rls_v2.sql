-- ALODILA-PMS Migration: 006 V2 — Soft RLS helpers + policies (NO indexes)
-- =============================================================================
-- STATUS: AUTHORED ONLY — DO NOT EXECUTE until clone exists + explicit approval.
-- SUPERSEDES: 006_sprint4_soft_rls_and_indexes.sql (V1) — do not apply V1.
-- Indexes: see 006b_sprint4_wave_a_indexes_concurrent.sql (separate, CONCURRENTLY).
--
-- Inventory SSOT: docs/SPRINT4_RLS_POLICY_INVENTORY.md (live names 2026-08-04)
-- JWT SSOT: docs/SPRINT4_JWT_CLAIM_MODEL.md
-- ALODILA: a1000000-a10d-4000-8000-000000000001
--
-- ARCHITECTURAL DECISIONS (challenge outcomes + Red Team Final Gate):
--   D1. Authz is app_metadata ONLY for company AND owner (closes user_metadata spoof).
--       Gate A MUST provision owner JWTs via Dashboard/service role before apply.
--   D2. is_super_admin() dual-reads app_metadata.role then top-level role
--       (NOT user_metadata). Aligns with PlatformGuard / closes SA spoof via user_metadata.
--   D3. current_company_id(): SA → NULL (SA uses is_super_admin policies, not company_*).
--   D4. Owner without company claim → ALODILA default (JWT-only; no owners table lookup).
--       Owner B MUST have app_metadata.company_id on clone.
--   D5. is_company_login(): role in (company, company_admin, company_staff) from
--       app_metadata ONLY — bare 'staff' alone is NOT enough without company_id claim.
--   D6. SELECT bodies rewritten in place using LIVE policy names.
--   D7. Legacy owner_id=auth.uid() branches AND company_matches.
--   D8. Company INSERT/UPDATE WITH CHECK binds company_id + parent FK company
--       + secondary_unit_ids jsonb same-company (Red Team C3; Production column type).
--   D9. companies.* policies UNCHANGED. Contaminant simp_* tables UNTOUCHED.
--  D10. Indexes NOT in this file — companion 006b.
--  D11. Precondition: company_id column present on payments (Package 5 proxy).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.companies') is null then
    raise exception '006 V2 aborted: public.companies missing.';
  end if;
  if not exists (
    select 1 from public.companies
    where id = 'a1000000-a10d-4000-8000-000000000001'::uuid
      and is_deleted = false
  ) then
    raise exception '006 V2 aborted: ALODILA seed missing.';
  end if;

  -- D11: Package 5 proxy — company_id must exist before soft policies reference it
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payments'
      and column_name = 'company_id'
  ) then
    raise exception
      '006 V2 aborted: public.payments.company_id missing. Apply Packages 1–5 first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Helpers — preserve contracts, harden claim paths
-- ---------------------------------------------------------------------------

-- D2: app_metadata.role first, then top-level; never user_metadata
create or replace function public.is_super_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select lower(trim(coalesce(
    nullif(trim(coalesce(
      current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}',
      ''
    )), ''),
    nullif(trim(coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'role',
      ''
    )), ''),
    ''
  ))) in ('super_admin', 'platform_super_admin');
$$;

comment on function public.is_super_admin() is
  '006 V2: Platform admin via app_metadata.role then top-level JWT role. Never user_metadata.';

-- Owner portal: app_metadata ONLY (Red Team C1 — closes user_metadata spoof)
create or replace function public.is_owner_portal_user()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select lower(trim(coalesce(
    current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}',
    ''
  ))) = 'owner';
$$;

create or replace function public.current_owner_id()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  v := trim(coalesce(
    current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,owner_crm_id}',
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

create or replace function public.current_owner_crm_id()
returns uuid
language sql
stable
as $$
  select public.current_owner_id();
$$;

-- D5: company operators — app_metadata role ONLY (no user_metadata spoof)
create or replace function public.is_company_login()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select lower(trim(coalesce(
    current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}',
    ''
  ))) in ('company', 'company_admin', 'company_staff')
  and nullif(trim(coalesce(
    current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,company_id}',
    ''
  )), '') is not null;
$$;

comment on function public.is_company_login() is
  '006 V2: app_metadata.role in (company|company_admin|company_staff) AND company_id present. No user_metadata.';

-- D3/D4: session company — JWT only, recursion-safe
create or replace function public.current_company_id()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  claims jsonb;
  v text;
  alodila constant uuid := 'a1000000-a10d-4000-8000-000000000001'::uuid;
begin
  begin
    claims := current_setting('request.jwt.claims', true)::jsonb;
  exception
    when others then
      claims := '{}'::jsonb;
  end;

  -- Prefer app_metadata; allow top-level transition; DO NOT read user_metadata.company_id
  v := nullif(trim(coalesce(claims #>> '{app_metadata,company_id}', '')), '');
  if v is null then
    v := nullif(trim(coalesce(claims ->> 'company_id', '')), '');
  end if;

  if v is not null then
    begin
      return v::uuid;
    exception
      when invalid_text_representation then
        v := null;
    end;
  end if;

  -- Owner portal without company claim → ALODILA (clone Owner B must set app_metadata.company_id)
  if public.is_owner_portal_user() and public.current_owner_id() is not null then
    return alodila;
  end if;

  -- D3: Super admin → NULL (use is_super_admin policies, not company_matches)
  if public.is_super_admin() then
    return null;
  end if;

  return null;
end;
$$;

comment on function public.current_company_id() is
  '006 V2: app_metadata/top-level company_id; owner default ALODILA; SA → NULL. No user_metadata. No owners lookup.';

create or replace function public.company_matches(row_company_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select
    case
      when public.current_company_id() is null then false
      when row_company_id is null then
        public.current_company_id() = 'a1000000-a10d-4000-8000-000000000001'::uuid
      else
        row_company_id = public.current_company_id()
    end;
$$;

create or replace function public.can_access_company_row(row_company_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.is_super_admin() or public.company_matches(row_company_id);
$$;

create or replace function public.owner_company_aligned(row_company_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.is_owner_portal_user()
     and public.current_owner_id() is not null
     and public.company_matches(row_company_id);
$$;

-- Red Team C3: every secondary_unit_ids element must be same-company alive unit (or empty)
-- Production + migrations/003: secondary_unit_ids is jsonb (JSON array of UUID strings), NOT uuid[].
drop function if exists public.secondary_units_same_company(uuid, uuid[]);
create or replace function public.secondary_units_same_company(p_company_id uuid, p_secondary jsonb)
returns boolean
language sql
stable
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

comment on function public.secondary_units_same_company(uuid, jsonb) is
  '006 V2 Red Team: reject cross-company secondary_unit_ids (jsonb UUID array) on contract write.';

-- ---------------------------------------------------------------------------
-- 2) SELECT policies — inventory names; company align; auth.uid + company_matches
-- ---------------------------------------------------------------------------

-- OWNERS
drop policy if exists owners_company_select on public.owners;
create policy owners_company_select on public.owners
for select to authenticated
using (
  is_deleted = false
  and public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists owners_owner_self_select on public.owners;
create policy owners_owner_self_select on public.owners
for select to authenticated
using (
  is_deleted = false
  and public.is_owner_portal_user()
  and id = public.current_owner_id()
  and public.owner_company_aligned(company_id)
);
-- owners_super_admin_policy PRESERVED (ALL)

-- TENANTS
drop policy if exists tenants_company_select on public.tenants;
create policy tenants_company_select on public.tenants
for select to authenticated
using (
  is_deleted = false
  and public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists tenants_select_policy on public.tenants;
create policy tenants_select_policy on public.tenants
for select to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and public.company_matches(company_id)
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
    and public.owner_company_aligned(company_id)
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

-- PROPERTIES (live name: owner_view_own_properties; also drop repo twin)
drop policy if exists properties_select_policy on public.properties;
drop policy if exists properties_company_select on public.properties;
create policy properties_company_select on public.properties
for select to authenticated
using (
  is_deleted = false
  and public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists owner_view_own_properties on public.properties;
create policy owner_view_own_properties on public.properties
for select to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and public.is_owner_portal_user()
    and owner_crm_id is not null
    and owner_crm_id = public.current_owner_id()
    and public.owner_company_aligned(company_id)
  )
  or (
    is_deleted = false
    and owner_id = auth.uid()
    and public.company_matches(company_id)
  )
);

-- UNITS
drop policy if exists units_company_select on public.units;
create policy units_company_select on public.units
for select to authenticated
using (
  is_deleted = false
  and public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists owner_view_own_units on public.units;
create policy owner_view_own_units on public.units
for select to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and public.is_owner_portal_user()
    and public.owner_company_aligned(company_id)
    and exists (
      select 1 from public.properties p
      where p.id = public.units.property_id
        and p.is_deleted = false
        and p.owner_crm_id = public.current_owner_id()
    )
  )
);

drop policy if exists units_select_policy on public.units;
create policy units_select_policy on public.units
for select to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and public.company_matches(company_id)
    and exists (
      select 1 from public.properties p
      where p.id = public.units.property_id
        and p.owner_id = auth.uid()
        and p.is_deleted = false
    )
  )
);

-- METERS
drop policy if exists meters_company_select on public.meters;
create policy meters_company_select on public.meters
for select to authenticated
using (
  is_deleted = false
  and public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists meters_select_policy on public.meters;
create policy meters_select_policy on public.meters
for select to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and public.company_matches(company_id)
    and exists (
      select 1 from public.properties p
      where p.id = public.meters.property_id
        and p.owner_id = auth.uid()
        and p.is_deleted = false
    )
  )
  or (
    public.is_owner_portal_user()
    and is_deleted = false
    and public.owner_company_aligned(company_id)
    and exists (
      select 1 from public.properties p
      where p.id = public.meters.property_id
        and p.is_deleted = false
        and p.owner_crm_id is not null
        and p.owner_crm_id = public.current_owner_id()
    )
  )
);

-- CONTRACTS
drop policy if exists contracts_company_select on public.contracts;
create policy contracts_company_select on public.contracts
for select to authenticated
using (
  is_deleted = false
  and public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists contracts_select_policy on public.contracts;
create policy contracts_select_policy on public.contracts
for select to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and public.company_matches(company_id)
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
    and public.owner_company_aligned(company_id)
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
drop policy if exists invoices_company_select on public.invoices;
create policy invoices_company_select on public.invoices
for select to authenticated
using (
  is_deleted = false
  and public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists invoices_select_policy on public.invoices;
create policy invoices_select_policy on public.invoices
for select to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and public.company_matches(company_id)
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
    and public.owner_company_aligned(company_id)
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
drop policy if exists payments_company_select on public.payments;
create policy payments_company_select on public.payments
for select to authenticated
using (
  is_deleted = false
  and public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists payments_select_policy on public.payments;
create policy payments_select_policy on public.payments
for select to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and public.company_matches(company_id)
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
    and public.owner_company_aligned(company_id)
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
drop policy if exists maintenance_company_select on public.maintenance_requests;
create policy maintenance_company_select on public.maintenance_requests
for select to authenticated
using (
  is_deleted = false
  and public.is_company_login()
  and public.company_matches(company_id)
);

drop policy if exists maintenance_select_policy on public.maintenance_requests;
create policy maintenance_select_policy on public.maintenance_requests
for select to authenticated
using (
  public.is_super_admin()
  or (
    is_deleted = false
    and public.company_matches(company_id)
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
    and public.owner_company_aligned(company_id)
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
-- 3) Company INSERT / UPDATE (SA insert/update policies PRESERVED)
--     D8: parent company_id must equal NEW.company_id
-- ---------------------------------------------------------------------------

-- OWNERS (no parent)
drop policy if exists owners_company_insert on public.owners;
create policy owners_company_insert on public.owners
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
);

drop policy if exists owners_company_update on public.owners;
create policy owners_company_update on public.owners
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
);

-- TENANTS
drop policy if exists tenants_company_insert on public.tenants;
create policy tenants_company_insert on public.tenants
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
);

drop policy if exists tenants_company_update on public.tenants;
create policy tenants_company_update on public.tenants
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
);

-- PROPERTIES (optional owner_crm_id same company when set)
drop policy if exists properties_company_insert on public.properties;
create policy properties_company_insert on public.properties
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and (
    owner_crm_id is null
    or exists (
      select 1 from public.owners o
      where o.id = owner_crm_id
        and o.company_id = company_id
        and o.is_deleted = false
    )
  )
);

drop policy if exists properties_company_update on public.properties;
create policy properties_company_update on public.properties
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and (
    owner_crm_id is null
    or exists (
      select 1 from public.owners o
      where o.id = owner_crm_id
        and o.company_id = company_id
        and o.is_deleted = false
    )
  )
);

-- UNITS → property
drop policy if exists units_company_insert on public.units;
create policy units_company_insert on public.units
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.properties p
    where p.id = property_id
      and p.company_id = company_id
      and p.is_deleted = false
  )
);

drop policy if exists units_company_update on public.units;
create policy units_company_update on public.units
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.properties p
    where p.id = property_id
      and p.company_id = company_id
      and p.is_deleted = false
  )
);

-- METERS → property
drop policy if exists meters_company_insert on public.meters;
create policy meters_company_insert on public.meters
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.properties p
    where p.id = property_id
      and p.company_id = company_id
      and p.is_deleted = false
  )
);

drop policy if exists meters_company_update on public.meters;
create policy meters_company_update on public.meters
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.properties p
    where p.id = property_id
      and p.company_id = company_id
      and p.is_deleted = false
  )
);

-- CONTRACTS → unit (+ tenant) + secondary_unit_ids same company
drop policy if exists contracts_company_insert on public.contracts;
create policy contracts_company_insert on public.contracts
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.units u
    where u.id = unit_id
      and u.company_id = company_id
      and u.is_deleted = false
  )
  and exists (
    select 1 from public.tenants t
    where t.id = tenant_id
      and t.company_id = company_id
      and t.is_deleted = false
  )
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
  and exists (
    select 1 from public.units u
    where u.id = unit_id
      and u.company_id = company_id
      and u.is_deleted = false
  )
  and exists (
    select 1 from public.tenants t
    where t.id = tenant_id
      and t.company_id = company_id
      and t.is_deleted = false
  )
  and public.secondary_units_same_company(company_id, secondary_unit_ids)
);

-- INVOICES → contract
drop policy if exists invoices_company_insert on public.invoices;
create policy invoices_company_insert on public.invoices
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.contracts c
    where c.id = contract_id
      and c.company_id = company_id
      and c.is_deleted = false
  )
);

drop policy if exists invoices_company_update on public.invoices;
create policy invoices_company_update on public.invoices
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.contracts c
    where c.id = contract_id
      and c.company_id = company_id
      and c.is_deleted = false
  )
);

-- PAYMENTS → invoice
drop policy if exists payments_company_insert on public.payments;
create policy payments_company_insert on public.payments
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and i.company_id = company_id
      and i.is_deleted = false
  )
);

drop policy if exists payments_company_update on public.payments;
create policy payments_company_update on public.payments
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and i.company_id = company_id
      and i.is_deleted = false
  )
);

-- MAINTENANCE → unit
drop policy if exists maintenance_company_insert on public.maintenance_requests;
create policy maintenance_company_insert on public.maintenance_requests
for insert to authenticated
with check (
  public.is_company_login()
  and is_deleted = false
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.units u
    where u.id = unit_id
      and u.company_id = company_id
      and u.is_deleted = false
  )
);

drop policy if exists maintenance_company_update on public.maintenance_requests;
create policy maintenance_company_update on public.maintenance_requests
for update to authenticated
using (public.is_company_login() and public.company_matches(company_id))
with check (
  public.is_company_login()
  and company_id is not null
  and company_id = public.current_company_id()
  and exists (
    select 1 from public.units u
    where u.id = unit_id
      and u.company_id = company_id
      and u.is_deleted = false
  )
);

commit;

-- =============================================================================
-- ROLLBACK (manual — capture BEFORE apply)
-- =============================================================================
-- 1) Before apply: dump pg_policies for in-scope tables to a backup file.
-- 2) Drop all policies where policyname like '%_company_%' or owners_owner_self_select.
-- 3) Restore SELECT policy bodies from backup (not only repo schema — live names differ).
-- 4) Helpers: leave in place (inert) OR recreate prior is_super_admin/is_owner_portal_user
--    from schema.sql / schema_owner_portal_rls.sql.
-- 5) Do NOT drop Package 1–5 company_id columns.
-- 6) companies.* policies must remain untouched throughout.
-- =============================================================================
