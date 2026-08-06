-- ALODILA-PMS Migration: Package 3 — Unit Layer (units, meters)
-- =============================================================================
-- STATUS: EXECUTED on ALODILA-PMS (Package 3). Do not re-run unless intentional.
-- Sprint: 3C (author Package 3) · Plan: Sprint 3B Execution Plan (approved)
-- Prerequisite: Package 2 COMPLETED (properties tagged) + companies seed
-- Pre-flight: 2026-08-04 READ-ONLY inspection — GO for SQL authoring (approved)
--
-- Scope (STRICT):
--   - public.units
--   - public.meters
--   NOTHING ELSE (no contracts/secondary_unit_ids/maintenance/finance/
--                 properties/owners/tenants/contaminants)
--
-- Strategy (Sprint 3B Package 3):
--   1) BEGIN
--   2) Preconditions (companies + ALODILA seed)
--   3) units: nullable company_id + units_company_id_idx + backfill ALODILA
--   4) meters: nullable company_id + meters_company_id_idx + backfill ALODILA
--   5) Validate zero NULLs + all ALODILA on both tables (abort on failure)
--   6) FOREIGN KEYs → public.companies(id)
--   7) COMMIT
--
-- Explicit non-goals:
--   - NOT NULL on company_id (deferred)
--   - RLS changes (deferred)
--   - Auth / app / business-logic changes
--   - ID rewrites, relationship rewrites, data deletes
--   - Touching contracts, secondary_unit_ids (jsonb), maintenance_requests,
--     invoices, payments, properties, owners, tenants
--
-- ALODILA company UUID (fixed seed from Migration 004):
--   a1000000-a10d-4000-8000-000000000001
--
-- File: supabase/migrations/005_package_3_units_meters.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Preconditions (fail closed)
-- ---------------------------------------------------------------------------
-- WHY: Package 3 FK targets public.companies. Missing ALODILA seed would make
--      backfill orphan UUIDs and cause the FK step to fail late.
-- WHY SAFE: Read-only existence checks; no writes; aborts the whole transaction.
-- WHY 3B: Global precondition — ALODILA company must exist before unit-layer tagging.
-- NOTE: Package 2 completion is an operational prerequisite; this block verifies
--       the companies seed specifically (same as Packages 1–2).

do $$
begin
  if to_regclass('public.companies') is null then
    raise exception
      'Package 3 aborted: public.companies does not exist. Complete Sprint 1 first.';
  end if;

  if not exists (
    select 1
    from public.companies
    where id = 'a1000000-a10d-4000-8000-000000000001'::uuid
      and is_deleted = false
  ) then
    raise exception
      'Package 3 aborted: ALODILA seed company (a1000000-a10d-4000-8000-000000000001) missing or soft-deleted.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) units — nullable company_id
-- ---------------------------------------------------------------------------
-- WHY: units is the primary unit-layer tenancy surface (parent of optional meters;
--      referenced by contracts.unit_id and maintenance_requests.unit_id).
-- WHY SAFE: ADD COLUMN nullable does not rewrite existing values, IDs, or FKs
--      (property_id → properties). Child/referencing FKs stay valid because
--      units.id is unchanged. App SELECT lists that omit company_id continue
--      to work. contracts.secondary_unit_ids (jsonb) is untouched.
-- WHY 3B: Package 3 = units + meters (approved isolation).

alter table public.units
  add column if not exists company_id uuid null;

comment on column public.units.company_id is
  'SaaS tenancy key → public.companies(id). Package 3: nullable; backfilled to ALODILA. NOT NULL deferred.';

-- ---------------------------------------------------------------------------
-- 2) units — non-unique index
-- ---------------------------------------------------------------------------
-- WHY: Speeds future company-scoped filters and post-backfill validation counts.
-- WHY SAFE: Non-unique btree on a new column; many units share one company.
-- WHY 3B: Index name fixed as units_company_id_idx per Package 3 directive.

create index if not exists units_company_id_idx
  on public.units (company_id);

-- ---------------------------------------------------------------------------
-- 3) units — backfill ALODILA
-- ---------------------------------------------------------------------------
-- WHY: Every existing production unit row belongs to ALODILA (single-tenant today).
-- WHY SAFE: Sets only company_id where NULL; does not change id/property_id/
--      unit_name/status/meter text refs/etc. Includes soft-deleted rows so
--      history remains tenant-tagged.
-- WHY 3B: Backfill before FK so the constraint cannot see orphans.
--
-- TRIGGER NOTE (expected / acceptable):
--   public.units has trigger set_updated_at_units
--   BEFORE UPDATE → set_updated_at().
--   This UPDATE will refresh updated_at on backfilled rows (~48 at author time).
--   That is expected side-effect of the existing trigger and is acceptable.
--   No trigger disable/drop is performed (would be out of scope / riskier).

update public.units
set company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid
where company_id is null;

-- ---------------------------------------------------------------------------
-- 4) meters — nullable company_id
-- ---------------------------------------------------------------------------
-- WHY: meters is the companion unit-layer table (property_id + optional unit_id).
-- WHY SAFE: ADD COLUMN nullable; does not rewrite IDs or FKs
--      (property_id → properties, unit_id → units). Empty table today still gets
--      schema readiness in the same package.
-- WHY 3B: Package 3 includes meters with units (approved pairing).

alter table public.meters
  add column if not exists company_id uuid null;

comment on column public.meters.company_id is
  'SaaS tenancy key → public.companies(id). Package 3: nullable; backfilled to ALODILA. NOT NULL deferred.';

-- ---------------------------------------------------------------------------
-- 5) meters — non-unique index
-- ---------------------------------------------------------------------------
-- WHY: Same company-scoped filter / validation support as units.
-- WHY SAFE: Non-unique btree; shared company values expected.
-- WHY 3B: Index name fixed as meters_company_id_idx per Package 3 directive.

create index if not exists meters_company_id_idx
  on public.meters (company_id);

-- ---------------------------------------------------------------------------
-- 6) meters — backfill ALODILA
-- ---------------------------------------------------------------------------
-- WHY: Any existing (or future pre-FK) NULL company_id rows belong to ALODILA today.
-- WHY SAFE: Sets only company_id where NULL; expected 0 rows at author time.
--      Includes soft-deleted rows if present later.
-- WHY 3B: Standard backfill path even when table is empty (idempotent no-op).
--
-- TRIGGER NOTE (expected / acceptable):
--   public.meters has trigger set_updated_at_meters
--   BEFORE UPDATE → set_updated_at().
--   Would refresh updated_at on any backfilled rows; none expected today.

update public.meters
set company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid
where company_id is null;

-- ---------------------------------------------------------------------------
-- 7) Validate — zero NULLs; all ALODILA (both tables)
-- ---------------------------------------------------------------------------
-- WHY: Sprint 3B requires an explicit validation gate before FK creation.
-- WHY SAFE: Raises inside the open transaction → COMMIT never happens on failure;
--      partial DDL/DML rolls back with the transaction.
-- WHY 3B: Abort if any NULL remains or any row is not the ALODILA UUID.
-- NOTE: Normal FK (not NOT VALID) — justified by small row counts (~48 units, ~0 meters).

do $$
declare
  v_null int;
  v_other int;
  v_alodila constant uuid := 'a1000000-a10d-4000-8000-000000000001';
begin
  select count(*) into v_null
  from public.units
  where company_id is null;

  if v_null > 0 then
    raise exception
      'Package 3 validation failed: NULL company_id remain on units (count=%).',
      v_null;
  end if;

  select count(*) into v_other
  from public.units
  where company_id is distinct from v_alodila;

  if v_other > 0 then
    raise exception
      'Package 3 validation failed: non-ALODILA company_id found on units (count=%).',
      v_other;
  end if;

  select count(*) into v_null
  from public.meters
  where company_id is null;

  if v_null > 0 then
    raise exception
      'Package 3 validation failed: NULL company_id remain on meters (count=%).',
      v_null;
  end if;

  select count(*) into v_other
  from public.meters
  where company_id is distinct from v_alodila;

  if v_other > 0 then
    raise exception
      'Package 3 validation failed: non-ALODILA company_id found on meters (count=%).',
      v_other;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8) Foreign keys → public.companies(id)
-- ---------------------------------------------------------------------------
-- WHY: Prevent orphan tenancy keys after backfill; referential integrity to registry.
-- WHY SAFE: All rows already point at the existing ALODILA company UUID (meters: 0).
--      ON DELETE / UPDATE NO ACTION — will not cascade-delete units/meters.
-- WHY 3B: Normal FK after validate; constraint names explicit for rollback.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'units_company_id_fkey'
      and conrelid = 'public.units'::regclass
  ) then
    alter table public.units
      add constraint units_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on update no action
      on delete no action;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'meters_company_id_fkey'
      and conrelid = 'public.meters'::regclass
  ) then
    alter table public.meters
      add constraint meters_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on update no action
      on delete no action;
  end if;
end $$;

commit;

-- =============================================================================
-- POST-EXECUTE VALIDATION QUERIES (manual; run after apply — NOT part of migration)
-- =============================================================================
-- Expected: company_id_null = 0; company_id_alodila = total on both tables;
--           FKs + indexes present; no company_id leak onto contracts/etc.
--
-- -- Coverage: units
-- select
--   count(*) as total,
--   count(*) filter (where company_id is null) as company_id_null,
--   count(*) filter (where company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid) as company_id_alodila
-- from public.units;
--
-- -- Coverage: meters
-- select
--   count(*) as total,
--   count(*) filter (where company_id is null) as company_id_null,
--   count(*) filter (where company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid) as company_id_alodila
-- from public.meters;
--
-- -- FK presence
-- select conname, conrelid::regclass as table_name
-- from pg_constraint
-- where conname in ('units_company_id_fkey', 'meters_company_id_fkey')
-- order by conname;
--
-- -- Index presence
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and indexname in ('units_company_id_idx', 'meters_company_id_idx')
-- order by indexname;
--
-- -- Scope sanity: Package 3 must not have added company_id elsewhere
-- select table_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and column_name = 'company_id'
--   and table_name not in ('owners', 'tenants', 'properties', 'units', 'meters')
-- order by table_name;
-- -- After Package 3, only owners + tenants + properties + units + meters
-- -- should have company_id.
--
-- =============================================================================
-- ROLLBACK SQL — Package 3 ONLY (manual; approve before run — NOT auto-executed)
-- =============================================================================
-- Trigger: smoke/validation failure after Package 3, or abort before Package 4.
-- Order: drop FKs → drop indexes → drop columns.
-- Safety: does not delete units/meters rows; does not touch contracts /
--         secondary_unit_ids / Package 1–2 tables.
--
-- begin;
--
-- alter table public.units drop constraint if exists units_company_id_fkey;
-- alter table public.meters drop constraint if exists meters_company_id_fkey;
--
-- drop index if exists public.units_company_id_idx;
-- drop index if exists public.meters_company_id_idx;
--
-- alter table public.units drop column if exists company_id;
-- alter table public.meters drop column if exists company_id;
--
-- commit;
--
-- =============================================================================
-- EXPECTED SMOKE TEST CHECKLIST (manual; after apply — NOT auto-executed)
-- =============================================================================
-- [ ] 1. Staff login succeeds
-- [ ] 2. Dashboard loads without errors
-- [ ] 3. Units list loads
-- [ ] 4. Unit detail opens
-- [ ] 5. Unit create/edit UI opens (save optional for smoke)
-- [ ] 6. Meters UI / property meters section (if used; table may be empty)
-- [ ] 7. Contracts list/detail still OK (unit_id + secondary_unit_ids unchanged)
-- [ ] 8. Properties / owners / tenants still OK (Package 1–2 regression)
-- [ ] 9. Owner portal units (if used in production)
-- [ ] 10. Platform Admin /platform/companies still lists ALODILA
--
-- Do NOT start Package 4 until this checklist is manually signed off.
-- =============================================================================
