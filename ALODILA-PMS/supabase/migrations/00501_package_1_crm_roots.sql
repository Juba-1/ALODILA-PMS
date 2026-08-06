-- ALODILA-PMS Migration 005: Package 1 — CRM Roots (owners, tenants)
-- =============================================================================
-- STATUS: EXECUTED on ALODILA-PMS (Sprint 3D Package 1). Do not re-run unless intentional.
-- Sprint: 3C (author only) · Plan: Sprint 3B Execution Plan (approved)
-- Prerequisite: Sprint 1 companies table + ALODILA seed row present
--
-- Scope (STRICT):
--   - public.owners
--   - public.tenants
--   NOTHING ELSE (no properties/units/contracts/finance/contaminants)
--
-- Strategy (Sprint 3B Package 1):
--   1) BEGIN
--   2) Add nullable company_id uuid
--   3) Non-unique index on company_id
--   4) Backfill all rows → ALODILA UUID
--   5) Validate zero NULLs (abort transaction if any remain)
--   6) FOREIGN KEY → public.companies(id)
--   7) COMMIT
--
-- Explicit non-goals:
--   - NOT NULL on company_id (deferred)
--   - RLS changes (deferred)
--   - Auth / app / business-logic changes
--   - ID rewrites, relationship rewrites, data deletes
--
-- ALODILA company UUID (fixed seed from Migration 004):
--   a1000000-a10d-4000-8000-000000000001
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Preconditions (fail closed)
-- ---------------------------------------------------------------------------
-- WHY: Package 1 FK targets public.companies. If the ALODILA seed is missing,
--      backfill would create orphan UUIDs and the FK step would fail late.
-- WHY SAFE: Read-only existence checks; no writes; aborts the whole transaction.
-- WHY 3B: Global precondition — ALODILA company must exist before CRM tagging.

do $$
begin
  if to_regclass('public.companies') is null then
    raise exception
      'Migration 005 aborted: public.companies does not exist. Complete Sprint 1 first.';
  end if;

  if not exists (
    select 1
    from public.companies
    where id = 'a1000000-a10d-4000-8000-000000000001'::uuid
      and is_deleted = false
  ) then
    raise exception
      'Migration 005 aborted: ALODILA seed company (a1000000-a10d-4000-8000-000000000001) missing or soft-deleted.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) owners — nullable company_id
-- ---------------------------------------------------------------------------
-- WHY: owners is a CRM root; first tenancy annotation surface without touching
--      portfolio/lease/finance tables.
-- WHY SAFE: ADD COLUMN nullable does not rewrite existing values, IDs, or FKs.
--      Application SELECT lists that omit company_id continue to work.
-- WHY 3B: Package 1 = CRM roots only (owners + tenants).

alter table public.owners
  add column if not exists company_id uuid null;

comment on column public.owners.company_id is
  'SaaS tenancy key → public.companies(id). Package 1: nullable; backfilled to ALODILA. NOT NULL deferred.';

-- ---------------------------------------------------------------------------
-- 2) owners — non-unique index
-- ---------------------------------------------------------------------------
-- WHY: Speeds future company-scoped filters and post-backfill validation counts.
-- WHY SAFE: Concurrent-friendly btree on a new column; does not enforce uniqueness
--      (many owners will share one company).
-- WHY 3B: Index before/with backfill; non-unique by design.

create index if not exists owners_company_id_idx
  on public.owners (company_id);

-- ---------------------------------------------------------------------------
-- 3) owners — backfill ALODILA
-- ---------------------------------------------------------------------------
-- WHY: Every existing production owner row belongs to ALODILA (single-tenant today).
-- WHY SAFE: Sets only company_id where NULL; does not change id/national_id/name/phone.
--      Includes soft-deleted rows so history remains tenant-tagged.
-- WHY 3B: Backfill before FK so the constraint cannot see orphans.

update public.owners
set company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid
where company_id is null;

-- ---------------------------------------------------------------------------
-- 4) tenants — nullable company_id
-- ---------------------------------------------------------------------------
-- WHY: tenants is the other CRM root; no FK to owners — safe in same package.
-- WHY SAFE: Same additive nullable pattern as owners.
-- WHY 3B: Package 1 groups independent CRM roots.

alter table public.tenants
  add column if not exists company_id uuid null;

comment on column public.tenants.company_id is
  'SaaS tenancy key → public.companies(id). Package 1: nullable; backfilled to ALODILA. NOT NULL deferred.';

-- ---------------------------------------------------------------------------
-- 5) tenants — non-unique index
-- ---------------------------------------------------------------------------
-- WHY / WHY SAFE / WHY 3B: Same rationale as owners_company_id_idx.

create index if not exists tenants_company_id_idx
  on public.tenants (company_id);

-- ---------------------------------------------------------------------------
-- 6) tenants — backfill ALODILA
-- ---------------------------------------------------------------------------
-- WHY / WHY SAFE / WHY 3B: Same rationale as owners backfill.

update public.tenants
set company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid
where company_id is null;

-- ---------------------------------------------------------------------------
-- 7) Validate — zero NULLs remain
-- ---------------------------------------------------------------------------
-- WHY: Sprint 3B requires an explicit validation gate before FK creation.
-- WHY SAFE: Raises inside the open transaction → COMMIT never happens on failure;
--      partial DDL/DML is rolled back with the transaction.
-- WHY 3B: "Validate that no NULL company_id values remain" before FK phase.
-- NOTE: Does not use NOT VALID FKs — DB size is tiny; normal FK after validate.

do $$
declare
  v_owners_null int;
  v_tenants_null int;
  v_owners_other int;
  v_tenants_other int;
  v_alodila constant uuid := 'a1000000-a10d-4000-8000-000000000001';
begin
  select count(*) into v_owners_null from public.owners where company_id is null;
  select count(*) into v_tenants_null from public.tenants where company_id is null;

  if v_owners_null > 0 or v_tenants_null > 0 then
    raise exception
      'Migration 005 validation failed: NULL company_id remain (owners=%, tenants=%).',
      v_owners_null, v_tenants_null;
  end if;

  select count(*) into v_owners_other
  from public.owners
  where company_id is distinct from v_alodila;

  select count(*) into v_tenants_other
  from public.tenants
  where company_id is distinct from v_alodila;

  if v_owners_other > 0 or v_tenants_other > 0 then
    raise exception
      'Migration 005 validation failed: non-ALODILA company_id found (owners=%, tenants=%).',
      v_owners_other, v_tenants_other;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8) Foreign keys → public.companies(id)
-- ---------------------------------------------------------------------------
-- WHY: Prevent orphan tenancy keys after backfill; referential integrity to registry.
-- WHY SAFE: All rows already point at the existing ALODILA company UUID.
--      ON DELETE NO ACTION / NO ACTION on update — will not cascade-delete CRM rows.
-- WHY 3B: Normal FK (not NOT VALID) — justified by tiny row counts (owners≈1, tenants≈27).
-- NOTE: Constraint names are explicit for clear rollback targeting.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'owners_company_id_fkey'
      and conrelid = 'public.owners'::regclass
  ) then
    alter table public.owners
      add constraint owners_company_id_fkey
      foreign key (company_id)
      references public.companies (id)
      on update no action
      on delete no action;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_company_id_fkey'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_company_id_fkey
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
-- Expected: company_id_null = 0; company_id_alodila = full row counts; FK present.
--
-- -- Coverage
-- select
--   'owners' as table_name,
--   count(*) as total,
--   count(*) filter (where company_id is null) as company_id_null,
--   count(*) filter (where company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid) as company_id_alodila
-- from public.owners
-- union all
-- select
--   'tenants',
--   count(*),
--   count(*) filter (where company_id is null),
--   count(*) filter (where company_id = 'a1000000-a10d-4000-8000-000000000001'::uuid)
-- from public.tenants;
--
-- -- FK presence
-- select conname, conrelid::regclass as table_name
-- from pg_constraint
-- where conname in ('owners_company_id_fkey', 'tenants_company_id_fkey');
--
-- -- Contaminant / out-of-scope sanity (must NOT have company_id from this package)
-- select table_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and column_name = 'company_id'
--   and table_name not in ('owners', 'tenants');
-- -- After Package 1 only, the only public tables with company_id should be owners + tenants.
-- -- (companies itself must NOT gain a company_id column.)
--
-- =============================================================================
-- ROLLBACK SQL — Package 1 ONLY (manual; approve before run — NOT auto-executed)
-- =============================================================================
-- Trigger: smoke/validation failure after Package 1, or decision to abort tenancy rollout
--          before Package 2.
-- Order: drop FKs → (optional null) → drop indexes → drop columns.
-- Safety: does not delete owners/tenants rows; does not touch other tables.
--
-- begin;
--
-- alter table public.tenants drop constraint if exists tenants_company_id_fkey;
-- alter table public.owners drop constraint if exists owners_company_id_fkey;
--
-- drop index if exists public.tenants_company_id_idx;
-- drop index if exists public.owners_company_id_idx;
--
-- alter table public.tenants drop column if exists company_id;
-- alter table public.owners drop column if exists company_id;
--
-- commit;
-- =============================================================================
