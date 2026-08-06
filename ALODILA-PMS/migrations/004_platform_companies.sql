-- ALODILA-PMS Migration 004: Platform Companies foundation (Sprint 1)
-- =============================================================================
-- STATUS: EXECUTED on ALODILA-PMS (Sprint 1 complete). Do not re-run unless intentional.
--
-- Goal:
--   Create public.companies only. Seed ALODILA Company row (new table only).
--
-- Hard constraints (Sprint 1):
--   - Does NOT alter any existing PMS tables.
--   - Does NOT add company_id to existing tables.
--   - Does NOT modify existing RLS policies on other tables.
--   - Does NOT modify Auth users, claims, or application code.
--
-- Rollback (only if no dependents on companies; approve before run):
--   begin;
--   drop policy if exists companies_select_policy on public.companies;
--   drop policy if exists companies_insert_policy on public.companies;
--   drop policy if exists companies_update_policy on public.companies;
--   drop trigger if exists set_updated_at_companies on public.companies;
--   drop table if exists public.companies;
--   commit;
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,

  name text not null,
  slug text not null,
  status text not null default 'active',

  -- MVP: One Company = One Login (nullable until a later auth-binding sprint)
  auth_user_id uuid null references auth.users (id) on delete set null,

  notes text null,

  constraint companies_name_nonempty_check
    check (char_length(trim(name)) > 0),

  constraint companies_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

  constraint companies_status_check
    check (status in ('active', 'suspended', 'provisioning')),

  constraint companies_slug_key unique (slug),
  constraint companies_auth_user_id_key unique (auth_user_id)
);

comment on table public.companies is
  'SaaS tenancy root. Sprint 1 foundation only; PMS tables are not yet linked.';

comment on column public.companies.auth_user_id is
  'MVP single company login (auth.users). Null until bound in a later sprint. One Company = One Login.';

comment on column public.companies.slug is
  'Stable unique code for the company (e.g. alodila).';

-- ---------------------------------------------------------------------------
-- 2) Indexes (beyond UNIQUE/PK)
-- ---------------------------------------------------------------------------
create index if not exists companies_is_deleted_idx
  on public.companies (is_deleted);

create index if not exists companies_status_idx
  on public.companies (status);

-- ---------------------------------------------------------------------------
-- 3) updated_at trigger (reuse existing function; do not replace it)
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at_companies on public.companies;
create trigger set_updated_at_companies
before update on public.companies
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) RLS — new table only (does not touch other tables' policies)
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;

drop policy if exists companies_select_policy on public.companies;
create policy companies_select_policy
on public.companies
for select
to authenticated
using (
  public.is_super_admin()
);

drop policy if exists companies_insert_policy on public.companies;
create policy companies_insert_policy
on public.companies
for insert
to authenticated
with check (
  public.is_super_admin()
  and is_deleted = false
);

drop policy if exists companies_update_policy on public.companies;
create policy companies_update_policy
on public.companies
for update
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);

-- No DELETE policy: soft-delete via UPDATE only.

-- ---------------------------------------------------------------------------
-- 5) Seed ALODILA Company (writes ONLY to public.companies)
-- Fixed UUID reserved for future backfills (Sprint 2+).
-- ---------------------------------------------------------------------------
insert into public.companies (
  id,
  name,
  slug,
  status,
  auth_user_id,
  notes,
  is_deleted
) values (
  'a1000000-a10d-4000-8000-000000000001'::uuid,
  'ALODILA',
  'alodila',
  'active',
  null,
  'Seeded in Sprint 1. Production PMS data remains on legacy tables until a later backfill sprint.',
  false
)
on conflict (id) do nothing;

commit;

-- =============================================================================
-- END OF MIGRATION 004 — not linked to application behavior in Sprint 1.
-- =============================================================================
