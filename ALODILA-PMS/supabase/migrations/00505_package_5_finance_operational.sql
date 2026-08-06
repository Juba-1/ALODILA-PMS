-- ALODILA-PMS Migration: Package 5 — Finance + Operational
-- =============================================================================
-- STATUS: EXECUTED on ALODILA-PMS (Package 5). Do not re-run unless intentional.
-- Sprint: 3C (author Package 5) · Plan: Sprint 3B Execution Plan (approved)
-- Prerequisite: Package 4 COMPLETED (contracts tagged) + companies seed
-- Discovery: 2026-08-04 — no new architectural risks vs Packages 1–4
--
-- Scope (STRICT):
--   - public.invoices
--   - public.payments
--   - public.maintenance_requests
--   NOTHING ELSE (no contracts/units/properties/owners/tenants/contaminants)
--
-- Strategy (same expand pattern as Packages 1–4):
--   1) BEGIN
--   2) Preconditions (companies + ALODILA seed)
--   3) Each table: nullable company_id + index + backfill ALODILA
--   4) Validate zero NULLs + all ALODILA on all three tables
--   5) FOREIGN KEYs → public.companies(id)
--   6) COMMIT
--
-- Explicit non-goals:
--   - NOT NULL on company_id (deferred)
--   - RLS changes (deferred) — Sprint 4
--   - Auth / app / business-logic changes
--   - ID rewrites (contract_id, invoice_id, unit_id, etc.)
--   - Touching Packages 1–4 tables
--
-- Live scale at author time (approx):
--   invoices ~269 (incl. soft-deleted); payments ~111; maintenance_requests ~0
--
-- ALODILA company UUID (fixed seed from Migration 004):
--   a1000000-a10d-4000-8000-000000000001
--
-- File: supabase/migrations/005_package_5_finance_operational.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Preconditions (fail closed)
-- ---------------------------------------------------------------------------
-- WHY: Package 5 FK targets public.companies. Missing ALODILA seed would make
--      backfill orphan UUIDs and cause the FK step to fail late.
-- WHY SAFE: Read-only existence checks; no writes; aborts the whole transaction.
-- WHY 3B: Global precondition — ALODILA company must exist before finance tagging.
-- NOTE: Package 4 completion is an operational prerequisite; this block verifies
--       the companies seed specifically (same as Packages 1–4).

do $$
begin
  if to_regclass('public.companies') is null then
    raise exception
      'Package 5 aborted: public.companies does not exist. Complete Sprint 1 first.';
  end if;

  if not exists (
    select 1
    from public.companies
    where id = 'a1000000-a10d-4000-8000-000000000001'::uuid
      and is_deleted = false
  ) then
    raise exception
      'Package 5 aborted: ALODILA seed company (a1000000-a10d-4000-8000-000000000001) missing or soft-deleted.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) invoices — nullable company_id
-- ---------------------------------------------------------------------------
-- WHY: invoices is the finance root (referenced by payments; FK → contracts).
-- WHY SAFE: ADD COLUMN nullable; does not rewrite id/contract_id or amounts.
--      Incoming payments.invoice_id FKs stay valid. Soft-deleted rows included
--      in later backfill so history remains tenant-tagged.
-- WHY 3B/5: Package 5 finance + operational layer.

alter table public.invoices
  add column if not exists company_id uuid null;

comment on column public.invoices.company_id is
  'SaaS tenancy key → public.companies(id). Package 5: nullable; backfilled to ALODILA. NOT NULL deferred.';

-- ---------------------------------------------------------------------------
-- 2) invoices — non-unique index
-- ---------------------------------------------------------------------------

create index if not exists invoices_company_id_idx
  on public.invoices (company_id);

-- ---------------------------------------------------------------------------
-- 3) invoices — backfill ALODILA
-- ---------------------------------------------------------------------------
-- TRIGGER NOTE (expected / acceptable):
--   set_updated_at_invoices BEFORE UPDATE → set_updated_at().
--   Backfill refreshes updated_at on touched rows (~269 at author time).

update public.invoices
set company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid
where company_id is null;

-- ---------------------------------------------------------------------------
-- 4) payments — nullable company_id
-- ---------------------------------------------------------------------------
-- WHY: payments is finance child (FK → invoices). Tag in same package as invoices
--      so finance tenancy completes together.
-- WHY SAFE: ADD COLUMN nullable; does not rewrite id/invoice_id.

alter table public.payments
  add column if not exists company_id uuid null;

comment on column public.payments.company_id is
  'SaaS tenancy key → public.companies(id). Package 5: nullable; backfilled to ALODILA. NOT NULL deferred.';

-- ---------------------------------------------------------------------------
-- 5) payments — non-unique index
-- ---------------------------------------------------------------------------

create index if not exists payments_company_id_idx
  on public.payments (company_id);

-- ---------------------------------------------------------------------------
-- 6) payments — backfill ALODILA
-- ---------------------------------------------------------------------------
-- TRIGGER NOTE: set_updated_at_payments — expected updated_at refresh (~111 rows).

update public.payments
set company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid
where company_id is null;

-- ---------------------------------------------------------------------------
-- 7) maintenance_requests — nullable company_id
-- ---------------------------------------------------------------------------
-- WHY: operational table (FK → units); empty today but schema-ready with finance.
-- WHY SAFE: ADD COLUMN nullable; does not rewrite id/unit_id.

alter table public.maintenance_requests
  add column if not exists company_id uuid null;

comment on column public.maintenance_requests.company_id is
  'SaaS tenancy key → public.companies(id). Package 5: nullable; backfilled to ALODILA. NOT NULL deferred.';

-- ---------------------------------------------------------------------------
-- 8) maintenance_requests — non-unique index
-- ---------------------------------------------------------------------------

create index if not exists maintenance_requests_company_id_idx
  on public.maintenance_requests (company_id);

-- ---------------------------------------------------------------------------
-- 9) maintenance_requests — backfill ALODILA
-- ---------------------------------------------------------------------------
-- TRIGGER NOTE: set_updated_at_maintenance_requests — no-op if 0 rows.
-- Expected 0 rows at author time; standard backfill path retained.

update public.maintenance_requests
set company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid
where company_id is null;

-- ---------------------------------------------------------------------------
-- 10) Validate — zero NULLs; all ALODILA (all three tables)
-- ---------------------------------------------------------------------------
-- WHY: Explicit validation gate before FK creation (same as Packages 1–4).
-- WHY SAFE: Raise aborts transaction → full rollback on failure.
-- NOTE: Normal FK (not NOT VALID) — row counts remain modest (~269+111+0).

do $$
declare
  v_null int;
  v_other int;
  v_alodila constant uuid := 'a1000000-a10d-4000-8000-000000000001';
begin
  -- invoices
  select count(*) into v_null
  from public.invoices
  where company_id is null;

  if v_null > 0 then
    raise exception
      'Package 5 validation failed: NULL company_id remain on invoices (count=%).',
      v_null;
  end if;

  select count(*) into v_other
  from public.invoices
  where company_id is distinct from v_alodila;

  if v_other > 0 then
    raise exception
      'Package 5 validation failed: non-ALODILA company_id found on invoices (count=%).',
      v_other;
  end if;

  -- payments
  select count(*) into v_null
  from public.payments
  where company_id is null;

  if v_null > 0 then
    raise exception
      'Package 5 validation failed: NULL company_id remain on payments (count=%).',
      v_null;
  end if;

  select count(*) into v_other
  from public.payments
  where company_id is distinct from v_alodila;

  if v_other > 0 then
    raise exception
      'Package 5 validation failed: non-ALODILA company_id found on payments (count=%).',
      v_other;
  end if;

  -- maintenance_requests
  select count(*) into v_null
  from public.maintenance_requests
  where company_id is null;

  if v_null > 0 then
    raise exception
      'Package 5 validation failed: NULL company_id remain on maintenance_requests (count=%).',
      v_null;
  end if;

  select count(*) into v_other
  from public.maintenance_requests
  where company_id is distinct from v_alodila;

  if v_other > 0 then
    raise exception
      'Package 5 validation failed: non-ALODILA company_id found on maintenance_requests (count=%).',
      v_other;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11) Foreign keys → public.companies(id)
-- ---------------------------------------------------------------------------
-- WHY: Referential integrity for tenancy keys after backfill.
-- WHY SAFE: All rows point at existing ALODILA UUID (maintenance may be 0 rows).
--      ON DELETE / UPDATE NO ACTION — no cascade deletes.
-- WHY 3B: Normal FK after validate; names explicit for rollback.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_company_id_fkey'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on update no action
      on delete no action;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_company_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on update no action
      on delete no action;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_requests_company_id_fkey'
      and conrelid = 'public.maintenance_requests'::regclass
  ) then
    alter table public.maintenance_requests
      add constraint maintenance_requests_company_id_fkey
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
--
-- -- Coverage: invoices
-- select
--   count(*) as total,
--   count(*) filter (where company_id is null) as company_id_null,
--   count(*) filter (where company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid) as company_id_alodila
-- from public.invoices;
--
-- -- Coverage: payments
-- select
--   count(*) as total,
--   count(*) filter (where company_id is null) as company_id_null,
--   count(*) filter (where company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid) as company_id_alodila
-- from public.payments;
--
-- -- Coverage: maintenance_requests
-- select
--   count(*) as total,
--   count(*) filter (where company_id is null) as company_id_null,
--   count(*) filter (where company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid) as company_id_alodila
-- from public.maintenance_requests;
--
-- -- FK presence
-- select conname, conrelid::regclass as table_name
-- from pg_constraint
-- where conname in (
--   'invoices_company_id_fkey',
--   'payments_company_id_fkey',
--   'maintenance_requests_company_id_fkey'
-- )
-- order by conname;
--
-- -- Index presence
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and indexname in (
--     'invoices_company_id_idx',
--     'payments_company_id_idx',
--     'maintenance_requests_company_id_idx'
--   )
-- order by indexname;
--
-- -- Scope sanity: Package 5 must not leak company_id onto other tables
-- select table_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and column_name = 'company_id'
--   and table_name not in (
--     'owners', 'tenants', 'properties', 'units', 'meters', 'contracts',
--     'invoices', 'payments', 'maintenance_requests'
--   )
-- order by table_name;
-- -- After Package 5, PMS core tables above should be the full company_id set
-- -- (excluding companies itself / contaminants if any).
--
-- =============================================================================
-- ROLLBACK SQL — Package 5 ONLY (manual; approve before run — NOT auto-executed)
-- =============================================================================
-- Trigger: smoke/validation failure after Package 5, or abort before Sprint 4.
-- Order: drop FKs → drop indexes → drop columns.
-- Safety: does not delete finance/maintenance rows; does not touch Packages 1–4.
--
-- begin;
--
-- alter table public.invoices
--   drop constraint if exists invoices_company_id_fkey;
-- alter table public.payments
--   drop constraint if exists payments_company_id_fkey;
-- alter table public.maintenance_requests
--   drop constraint if exists maintenance_requests_company_id_fkey;
--
-- drop index if exists public.invoices_company_id_idx;
-- drop index if exists public.payments_company_id_idx;
-- drop index if exists public.maintenance_requests_company_id_idx;
--
-- alter table public.invoices drop column if exists company_id;
-- alter table public.payments drop column if exists company_id;
-- alter table public.maintenance_requests drop column if exists company_id;
--
-- commit;
--
-- =============================================================================
-- EXPECTED SMOKE TEST CHECKLIST (manual; after apply — NOT auto-executed)
-- =============================================================================
-- [ ] 1. Staff login succeeds
-- [ ] 2. Dashboard loads without errors
-- [ ] 3. Invoices list / detail
-- [ ] 4. Payments list / detail (or invoice payment history)
-- [ ] 5. Maintenance list (may be empty)
-- [ ] 6. Contracts list/detail regression (Package 4)
-- [ ] 7. Units / properties / owners / tenants regression (Packages 1–3)
-- [ ] 8. Platform Admin /platform/companies still lists ALODILA
--
-- After Package 5 smoke sign-off: Sprint 3 tenancy DDL packages are complete.
-- Do NOT start Sprint 4 RLS/app filters until Package 5 is closed.
-- =============================================================================
