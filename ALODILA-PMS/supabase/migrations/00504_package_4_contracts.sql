-- ALODILA-PMS Migration: Package 4 — Contracts (lease root)
-- =============================================================================
-- STATUS: EXECUTED on ALODILA-PMS (Package 4). Do not re-run unless intentional.
-- Sprint: 3C (author Package 4) · Plan: Sprint 3B Execution Plan (approved)
-- Prerequisite: Package 3 COMPLETED (units/meters tagged) + companies seed
-- Pre-flight: 2026-08-04 READ-ONLY discovery — CONDITIONAL GO (P3 prerequisite met)
--
-- Scope (STRICT):
--   - public.contracts ONLY
--   NOTHING ELSE (no invoices/payments/maintenance/units/meters/
--                 properties/owners/tenants/secondary_unit_ids mutation)
--
-- Strategy (Sprint 3B Package 4):
--   1) BEGIN
--   2) Preconditions (companies + ALODILA seed)
--   3) Add nullable company_id uuid
--   4) Non-unique index contracts_company_id_idx
--   5) Backfill all rows → ALODILA UUID
--   6) Validate zero NULLs + all ALODILA (abort on failure)
--   7) FOREIGN KEY → public.companies(id)
--   8) COMMIT
--
-- Explicit non-goals:
--   - NOT NULL on company_id (deferred)
--   - RLS changes (deferred)
--   - Auth / app / business-logic changes
--   - ID rewrites (unit_id, tenant_id, contract id)
--   - JSONB / secondary_unit_ids mutation
--   - Touching invoices, payments, maintenance_requests, or earlier packages
--
-- ALODILA company UUID (fixed seed from Migration 004):
--   a1000000-a10d-4000-8000-000000000001
--
-- File: supabase/migrations/005_package_4_contracts.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Preconditions (fail closed)
-- ---------------------------------------------------------------------------
-- WHY: Package 4 FK targets public.companies. Missing ALODILA seed would make
--      backfill orphan UUIDs and cause the FK step to fail late.
-- WHY SAFE: Read-only existence checks; no writes; aborts the whole transaction.
-- WHY 3B: Global precondition — ALODILA company must exist before contract tagging.
-- NOTE: Package 3 completion is an operational prerequisite; this block verifies
--       the companies seed specifically (same as Packages 1–3).

do $$
begin
  if to_regclass('public.companies') is null then
    raise exception
      'Package 4 aborted: public.companies does not exist. Complete Sprint 1 first.';
  end if;

  if not exists (
    select 1
    from public.companies
    where id = 'a1000000-a10d-4000-8000-000000000001'::uuid
      and is_deleted = false
  ) then
    raise exception
      'Package 4 aborted: ALODILA seed company (a1000000-a10d-4000-8000-000000000001) missing or soft-deleted.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) contracts — nullable company_id
-- ---------------------------------------------------------------------------
-- WHY: contracts is the lease root; next tenancy annotation after the unit layer.
-- WHY SAFE: ADD COLUMN nullable does not rewrite existing values, IDs, or FKs
--      (unit_id → units, tenant_id → tenants). secondary_unit_ids jsonb is
--      untouched. Incoming invoices.contract_id FKs remain valid because
--      contracts.id is unchanged. App SELECT lists that omit company_id
--      continue to work.
-- WHY 3B: Package 4 = contracts alone (approved isolation).

alter table public.contracts
  add column if not exists company_id uuid null;

comment on column public.contracts.company_id is
  'SaaS tenancy key → public.companies(id). Package 4: nullable; backfilled to ALODILA. NOT NULL deferred.';

-- ---------------------------------------------------------------------------
-- 2) contracts — non-unique index
-- ---------------------------------------------------------------------------
-- WHY: Speeds future company-scoped filters and post-backfill validation counts.
-- WHY SAFE: Non-unique btree on a new column; many contracts share one company.
-- WHY 3B: Index name fixed as contracts_company_id_idx per Package 4 directive.

create index if not exists contracts_company_id_idx
  on public.contracts (company_id);

-- ---------------------------------------------------------------------------
-- 3) contracts — backfill ALODILA
-- ---------------------------------------------------------------------------
-- WHY: Every existing production contract row belongs to ALODILA (single-tenant today).
-- WHY SAFE: Sets only company_id where NULL; does not change id/unit_id/tenant_id/
--      secondary_unit_ids/status/dates/values/etc. Includes soft-deleted rows so
--      history remains tenant-tagged.
-- WHY 3B: Backfill before FK so the constraint cannot see orphans.
--
-- TRIGGER NOTE (expected / acceptable):
--   public.contracts has trigger set_updated_at_contracts
--   BEFORE UPDATE → set_updated_at().
--   This UPDATE will refresh updated_at on backfilled rows (~28 at author time).
--   That is expected side-effect of the existing trigger and is acceptable.
--   No trigger disable/drop is performed (would be out of scope / riskier).

update public.contracts
set company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid
where company_id is null;

-- ---------------------------------------------------------------------------
-- 4) Validate — zero NULLs; all ALODILA
-- ---------------------------------------------------------------------------
-- WHY: Sprint 3B requires an explicit validation gate before FK creation.
-- WHY SAFE: Raises inside the open transaction → COMMIT never happens on failure;
--      partial DDL/DML rolls back with the transaction.
-- WHY 3B: Abort if any NULL remains or any row is not the ALODILA UUID.
-- NOTE: Normal FK (not NOT VALID) — justified by small row count (~28 contracts).

do $$
declare
  v_null int;
  v_other int;
  v_alodila constant uuid := 'a1000000-a10d-4000-8000-000000000001';
begin
  select count(*) into v_null
  from public.contracts
  where company_id is null;

  if v_null > 0 then
    raise exception
      'Package 4 validation failed: NULL company_id remain on contracts (count=%).',
      v_null;
  end if;

  select count(*) into v_other
  from public.contracts
  where company_id is distinct from v_alodila;

  if v_other > 0 then
    raise exception
      'Package 4 validation failed: non-ALODILA company_id found on contracts (count=%).',
      v_other;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Foreign key → public.companies(id)
-- ---------------------------------------------------------------------------
-- WHY: Prevent orphan tenancy keys after backfill; referential integrity to registry.
-- WHY SAFE: All rows already point at the existing ALODILA company UUID.
--      ON DELETE / UPDATE NO ACTION — will not cascade-delete contracts.
-- WHY 3B: Normal FK after validate; constraint name explicit for rollback.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contracts_company_id_fkey'
      and conrelid = 'public.contracts'::regclass
  ) then
    alter table public.contracts
      add constraint contracts_company_id_fkey
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
--           no company_id on invoices/payments/maintenance from this package.
--
-- -- Coverage
-- select
--   count(*) as total,
--   count(*) filter (where company_id is null) as company_id_null,
--   count(*) filter (where company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid) as company_id_alodila
-- from public.contracts;
--
-- -- FK presence
-- select conname, conrelid::regclass as table_name
-- from pg_constraint
-- where conname = 'contracts_company_id_fkey';
--
-- -- Index presence
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and indexname = 'contracts_company_id_idx';
--
-- -- Scope sanity: Package 4 must not have added company_id elsewhere
-- select table_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and column_name = 'company_id'
--   and table_name not in (
--     'owners', 'tenants', 'properties', 'units', 'meters', 'contracts'
--   )
-- order by table_name;
-- -- After Package 4, only owners + tenants + properties + units + meters +
-- -- contracts should have company_id.
--
-- -- secondary_unit_ids untouched sanity (structure only; values unchanged by P4)
-- -- select count(*) as contracts_with_secondary
-- -- from public.contracts
-- -- where jsonb_typeof(secondary_unit_ids) = 'array'
-- --   and jsonb_array_length(secondary_unit_ids) > 0;
--
-- =============================================================================
-- ROLLBACK SQL — Package 4 ONLY (manual; approve before run — NOT auto-executed)
-- =============================================================================
-- Trigger: smoke/validation failure after Package 4, or abort before Package 5.
-- Order: drop FK → drop index → drop column.
-- Safety: does not delete contracts rows; does not touch secondary_unit_ids,
--         invoices, payments, maintenance, or Packages 1–3.
--
-- begin;
--
-- alter table public.contracts drop constraint if exists contracts_company_id_fkey;
--
-- drop index if exists public.contracts_company_id_idx;
--
-- alter table public.contracts drop column if exists company_id;
--
-- commit;
--
-- =============================================================================
-- EXPECTED SMOKE TEST CHECKLIST (manual; after apply — NOT auto-executed)
-- =============================================================================
-- [ ] 1. Staff login succeeds
-- [ ] 2. Dashboard loads without errors
-- [ ] 3. Contracts list loads
-- [ ] 4. Contract detail opens (primary unit + secondary units display OK)
-- [ ] 5. Contract create/edit UI opens (save optional for smoke)
-- [ ] 6. Invoices list still OK (regression — Package 5 not yet applied)
-- [ ] 7. Units / properties / owners / tenants still OK (Packages 1–3 regression)
-- [ ] 8. Platform Admin /platform/companies still lists ALODILA
--
-- Do NOT start Package 5 until this checklist is manually signed off.
-- =============================================================================
