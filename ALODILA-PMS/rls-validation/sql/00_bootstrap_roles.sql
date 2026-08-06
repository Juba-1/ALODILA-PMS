-- rls-validation/sql/00_bootstrap_roles.sql
-- Local-only roles, auth stub, extensions. Idempotent.
-- NEVER run against Production.

create extension if not exists pgcrypto;

-- Roles used by Supabase RLS policies (to authenticated)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Minimal auth schema so FKs / auth.uid() resolve (not a real GoTrue)
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text null,
  created_at timestamptz not null default now()
);

-- Mirrors Supabase auth.uid() claim resolution for local GUC simulation
create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

grant usage on schema auth to authenticated, anon, service_role;
grant select on auth.users to authenticated, service_role;

-- updated_at helper (schema.sql / migration 004)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Stub is_super_admin — replaced by 006 V2
create or replace function public.is_super_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  ) = 'super_admin';
$$;
