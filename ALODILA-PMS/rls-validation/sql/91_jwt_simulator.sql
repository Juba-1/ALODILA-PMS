-- rls-validation/sql/91_jwt_simulator.sql
-- Reusable JWT claim simulation for local Postgres.
--
-- WHY THIS REPRODUCES SUPABASE RLS:
--   PostgREST sets GUCs from the verified JWT before running SQL:
--     request.jwt.claims = <json>
--     request.jwt.claim.sub = <sub>
--   Soft RLS helpers in 006 V2 read ONLY those GUCs (app_metadata paths).
--   Locally we set the same GUCs via set_config(..., true) for transaction-local
--   scope, then SET LOCAL ROLE authenticated so policies to authenticated apply.
--
-- NEVER rely on user_metadata for authz in claims used by PASS cases.

create schema if not exists rls_val;

create table if not exists rls_val.results (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  test_id text not null,
  purpose text not null,
  expected text not null check (expected in ('PASS', 'FAIL')),
  actual text not null check (actual in ('PASS', 'FAIL', 'ERROR')),
  detail text null,
  ok boolean generated always as (expected = actual) stored
);

truncate rls_val.results restart identity;

create or replace function rls_val.clear_jwt()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create or replace function rls_val.set_jwt(p_claims jsonb)
returns void
language plpgsql
as $$
declare
  v_sub text;
begin
  v_sub := coalesce(p_claims ->> 'sub', '');
  perform set_config('request.jwt.claims', p_claims::text, true);
  perform set_config('request.jwt.claim.sub', v_sub, true);
end;
$$;

-- Company operator — app_metadata ONLY
create or replace function rls_val.jwt_company(p_company_id uuid, p_role text default 'company', p_sub uuid default null)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'sub', coalesce(p_sub, '11111111-1111-4111-8111-111111111111'::uuid),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'role', p_role,
      'company_id', p_company_id::text
    )
  );
$$;

-- Owner portal — app_metadata ONLY
create or replace function rls_val.jwt_owner(p_owner_id uuid, p_company_id uuid, p_sub uuid default null)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'sub', coalesce(p_sub, '33333333-3333-4333-8333-333333333333'::uuid),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'role', 'owner',
      'owner_crm_id', p_owner_id::text,
      'company_id', p_company_id::text
    )
  );
$$;

-- Platform SA — app_metadata.role (primary path in 006 V2)
create or replace function rls_val.jwt_sa(p_sub uuid default null)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'sub', coalesce(p_sub, '99999999-9999-4999-8999-999999999999'::uuid),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'role', 'platform_super_admin'
    )
  );
$$;

-- Malicious: authz only in user_metadata (must FAIL for company/owner helpers)
create or replace function rls_val.jwt_spoof_user_metadata(p_company_id uuid, p_owner_id uuid default null)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'sub', '55555555-5555-4555-8555-555555555555'::uuid,
    'role', 'authenticated',
    'user_metadata', jsonb_build_object(
      'role', case when p_owner_id is null then 'company' else 'owner' end,
      'company_id', p_company_id::text,
      'owner_crm_id', p_owner_id::text
    )
  );
$$;

create or replace function rls_val.record(
  p_test_id text,
  p_purpose text,
  p_expected text,
  p_actual text,
  p_detail text default null
)
returns void
language sql
as $$
  insert into rls_val.results (test_id, purpose, expected, actual, detail)
  values (p_test_id, p_purpose, p_expected, p_actual, p_detail);
$$;

grant usage on schema rls_val to authenticated;
grant select, insert on rls_val.results to authenticated;
grant usage, select on all sequences in schema rls_val to authenticated;

comment on schema rls_val is
  'Local RLS validation harness. JWT GUC simulation mirrors PostgREST claim injection.';
