-- rls-validation/sql/02_companies_seed.sql
-- Seed ALODILA + Company B. Run as table owner (bypasses FORCE RLS as owner... 
-- wait: FORCE RLS means owner ALSO subject to RLS. Seed as postgres with
-- SET ROLE none / use BYPASSRLS via session — postgres superuser bypasses even FORCE.
-- Superusers bypass RLS always. Pipeline applies this as RLS_PGUSER=postgres (superuser).

insert into public.companies (id, name, slug, status, auth_user_id, notes, is_deleted)
values (
  'a1000000-a10d-4000-8000-000000000001'::uuid,
  'ALODILA',
  'alodila',
  'active',
  null,
  'Harness seed — ALODILA',
  false
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  is_deleted = false;

insert into public.companies (id, name, slug, status, auth_user_id, notes, is_deleted)
values (
  'b2000000-b20d-4000-8000-000000000002'::uuid,
  'Company B',
  'company-b',
  'active',
  null,
  'Harness seed — isolation peer',
  false
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  is_deleted = false;
