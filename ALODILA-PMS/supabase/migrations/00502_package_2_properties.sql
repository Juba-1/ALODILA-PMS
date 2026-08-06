-- ALODILA-PMS Migration: Package 2 — Portfolio Root (properties)
-- =============================================================================
-- STATUS: EXECUTED on ALODILA-PMS (Package 2). Do not re-run unless intentional.
-- Sprint: 3C (author Package 2) · Plan: Sprint 3B Execution Plan (approved)
-- Prerequisite: Package 1 COMPLETED (owners/tenants tagged) + companies seed
-- Pre-flight: 2026-08-04 READ-ONLY inspection — GO for SQL authoring
--
-- Scope (STRICT):
--   - public.properties ONLY
--   NOTHING ELSE (no units/meters/contracts/finance/maintenance/contaminants)
--
-- Strategy (Sprint 3B Package 2):
--   1) BEGIN
--   2) Preconditions (companies + ALODILA seed)
--   3) Add nullable company_id uuid
--   4) Non-unique index properties_company_id_idx
--   5) Backfill all rows → ALODILA UUID
--   6) Validate zero NULLs + all ALODILA (abort on failure)
--   7) FOREIGN KEY → public.companies(id)
--   8) COMMIT
--
-- Explicit non-goals:
--   - NOT NULL on company_id (deferred)
--   - RLS changes (deferred)
--   - Auth / app / business-logic changes
--   - ID rewrites, relationship rewrites, data deletes
--   - Touching units, meters, or any child of properties
--
-- ALODILA company UUID (fixed seed from Migration 004):
--   a1000000-a10d-4000-8000-000000000001
--
-- File: supabase/migrations/005_package_2_properties.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Preconditions (fail closed)
-- ---------------------------------------------------------------------------
-- WHY: Package 2 FK targets public.companies. Missing ALODILA seed would make
--      backfill orphan UUIDs and cause the FK step to fail late.
-- WHY SAFE: Read-only existence checks; no writes; aborts the whole transaction.
-- WHY 3B: Global precondition — ALODILA company must exist before portfolio tagging.
-- NOTE: Package 1 completion is an operational prerequisite; this block verifies
--       the companies seed specifically (same as Package 1).

do $$
begin
  if to_regclass('public.companies') is null then
    raise exception
      'Package 2 aborted: public.companies does not exist. Complete Sprint 1 first.';
  end if;

  if not exists (
    select 1
    from public.companies
    where id = 'a1000000-a10d-4000-8000-000000000001'::uuid
      and is_deleted = false
  ) then
    raise exception
      'Package 2 aborted: ALODILA seed company (a1000000-a10d-4000-8000-000000000001) missing or soft-deleted.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) properties — nullable company_id
-- ---------------------------------------------------------------------------
-- WHY: properties is the portfolio root; next tenancy annotation after CRM roots.
-- WHY SAFE: ADD COLUMN nullable does not rewrite existing values, IDs, or FKs
--      (owner_id → auth.users, owner_crm_id → owners). Child FKs from units/meters
--      to properties.id are unaffected. App SELECT lists that omit company_id
--      continue to work.
-- WHY 3B: Package 2 = properties alone (approved isolation).

alter table public.properties
  add column if not exists company_id uuid null;

comment on column public.properties.company_id is
  'SaaS tenancy key → public.companies(id). Package 2: nullable; backfilled to ALODILA. NOT NULL deferred.';

-- ---------------------------------------------------------------------------
-- 2) properties — non-unique index
-- ---------------------------------------------------------------------------
-- WHY: Speeds future company-scoped filters and post-backfill validation counts.
-- WHY SAFE: Non-unique btree on a new column; many properties share one company.
-- WHY 3B: Index name fixed as properties_company_id_idx per Package 2 directive.

create index if not exists properties_company_id_idx
  on public.properties (company_id);

-- ---------------------------------------------------------------------------
-- 3) properties — backfill ALODILA
-- ---------------------------------------------------------------------------
-- WHY: Every existing production property row belongs to ALODILA (single-tenant today).
-- WHY SAFE: Sets only company_id where NULL; does not change id/name/owner_*/meters/etc.
--      Includes soft-deleted rows so history remains tenant-tagged.
-- WHY 3B: Backfill before FK so the constraint cannot see orphans.
--
-- TRIGGER NOTE (expected / acceptable):
--   public.properties has trigger set_updated_at_properties
--   BEFORE UPDATE → set_updated_at().
--   This UPDATE will refresh updated_at on backfilled rows.
--   That is expected side-effect of the existing trigger and is acceptable for Package 2.
--   No trigger disable/drop is performed (would be out of scope / riskier).

update public.properties
set company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid
where company_id is null;

-- ---------------------------------------------------------------------------
-- 4) Validate — zero NULLs; all ALODILA
-- ---------------------------------------------------------------------------
-- WHY: Sprint 3B requires an explicit validation gate before FK creation.
-- WHY SAFE: Raises inside the open transaction → COMMIT never happens on failure;
--      partial DDL/DML rolls back with the transaction.
-- WHY 3B: Abort if any NULL remains or any row is not the ALODILA UUID.
-- NOTE: Normal FK (not NOT VALID) — justified by tiny row count (~2 properties).

do $$
declare
  v_null int;
  v_other int;
  v_alodila constant uuid := 'a1000000-a10d-4000-8000-000000000001';
begin
  select count(*) into v_null
  from public.properties
  where company_id is null;

  if v_null > 0 then
    raise exception
      'Package 2 validation failed: NULL company_id remain on properties (count=%).',
      v_null;
  end if;

  select count(*) into v_other
  from public.properties
  where company_id is distinct from v_alodila;

  if v_other > 0 then
    raise exception
      'Package 2 validation failed: non-ALODILA company_id found on properties (count=%).',
      v_other;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Foreign key → public.companies(id)
-- ---------------------------------------------------------------------------
-- WHY: Prevent orphan tenancy keys after backfill; referential integrity to registry.
-- WHY SAFE: All rows already point at the existing ALODILA company UUID.
--      ON DELETE / UPDATE NO ACTION — will not cascade-delete properties.
-- WHY 3B: Normal FK after validate; constraint name explicit for rollback.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'properties_company_id_fkey'
      and conrelid = 'public.properties'::regclass
  ) then
    alter table public.properties
      add constraint properties_company_id_fkey
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
-- Expected: company_id_null = 0; company_id_alodila = total; FK + index present;
--           no company_id on units/meters/contracts/etc. from this package.
--
-- -- Coverage
-- select
--   count(*) as total,
--   count(*) filter (where company_id is null) as company_id_null,
--   count(*) filter (where company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid) as company_id_alodila
-- from public.properties;
--
-- -- FK presence
-- select conname, conrelid::regclass as table_name
-- from pg_constraint
-- where conname = 'properties_company_id_fkey';
--
-- -- Index presence
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and indexname = 'properties_company_id_idx';
--
-- -- Scope sanity: Package 2 must not have added company_id elsewhere
-- select table_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and column_name = 'company_id'
--   and table_name not in ('owners', 'tenants', 'properties')
-- order by table_name;
-- -- After Package 2, only owners + tenants + properties should have company_id.
--
-- =============================================================================
-- ROLLBACK SQL — Package 2 ONLY (manual; approve before run — NOT auto-executed)
-- =============================================================================
-- Trigger: smoke/validation failure after Package 2, or abort before Package 3.
-- Order: drop FK → drop index → drop column.
-- Safety: does not delete properties rows; does not touch Package 1 or child tables.
--
-- begin;
--
-- alter table public.properties drop constraint if exists properties_company_id_fkey;
--
-- drop index if exists public.properties_company_id_idx;
--
-- alter table public.properties drop column if exists company_id;
--
-- commit;
--
-- =============================================================================
-- EXPECTED SMOKE TEST CHECKLIST (manual; after apply — NOT auto-executed)
-- =============================================================================
-- [ ] 1. Staff login succeeds
-- [ ] 2. Dashboard loads without errors
-- [ ] 3. Properties list loads
-- [ ] 4. Property detail opens
-- [ ] 5. Property create/edit UI opens (save optional for smoke)
-- [ ] 6. Owner portal properties list/detail (if used in production)
-- [ ] 7. Owners / tenants screens still OK (Package 1 regression)
-- [ ] 8. Platform Admin /platform/companies still lists ALODILA
--
-- Do NOT start Package 3 until this checklist is manually signed off.
-- =============================================================================
