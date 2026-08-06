-- =============================================================================
-- ALODILA-PMS — Auth claim inventory (READ-ONLY)
-- =============================================================================
-- Purpose : Classify auth.users by app_metadata vs user_metadata authz keys.
-- Scope   : Local Supabase or approved CLONE only — NEVER Production.
-- Writes  : NONE. Safe to run repeatedly.
-- Governing: docs/SPRINT4_JWT_CLAIM_MODEL.md · docs/SPRINT5_AUTH_CUTOVER_PLAN.md
-- ALODILA UUID: a1000000-a10d-4000-8000-000000000001
-- =============================================================================
-- Connect example (local — adjust port from `supabase status`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f auth-inventory.sql
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1) Summary counts
-- ---------------------------------------------------------------------------
select
  count(*) as total_users,
  count(*) filter (where coalesce(raw_app_meta_data ->> 'role', '') <> '') as has_app_role,
  count(*) filter (where coalesce(raw_user_meta_data ->> 'role', '') <> '') as has_user_role,
  count(*) filter (
    where coalesce(raw_user_meta_data ->> 'role', '') <> ''
       or coalesce(raw_user_meta_data ->> 'company_id', '') <> ''
       or coalesce(raw_user_meta_data ->> 'owner_crm_id', '') <> ''
  ) as users_with_user_metadata_authz,
  count(*) filter (
    where lower(trim(coalesce(raw_app_meta_data ->> 'role', ''))) in (
      'super_admin', 'platform_super_admin'
    )
  ) as platform_admin_candidates,
  count(*) filter (
    where lower(trim(coalesce(raw_app_meta_data ->> 'role', ''))) in (
      'company', 'company_admin', 'company_staff'
    )
  ) as company_operator_candidates,
  count(*) filter (
    where lower(trim(coalesce(raw_app_meta_data ->> 'role', ''))) = 'owner'
  ) as owner_candidates
from auth.users;

-- ---------------------------------------------------------------------------
-- 2) Per-user classification (primary operator view)
-- ---------------------------------------------------------------------------
with classified as (
  select
    u.id,
    u.email,
    u.created_at,
    u.last_sign_in_at,
    lower(trim(coalesce(u.raw_app_meta_data ->> 'role', ''))) as app_role,
    nullif(trim(coalesce(u.raw_app_meta_data ->> 'company_id', '')), '') as app_company_id,
    nullif(trim(coalesce(u.raw_app_meta_data ->> 'owner_crm_id', '')), '') as app_owner_crm_id,
    lower(trim(coalesce(u.raw_user_meta_data ->> 'role', ''))) as user_role,
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'company_id', '')), '') as user_company_id,
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'owner_crm_id', '')), '') as user_owner_crm_id,
    (coalesce(u.raw_user_meta_data ->> 'role', '') <> ''
      or coalesce(u.raw_user_meta_data ->> 'company_id', '') <> ''
      or coalesce(u.raw_user_meta_data ->> 'owner_crm_id', '') <> '') as user_metadata_has_authz,
  case
    when lower(trim(coalesce(u.raw_app_meta_data ->> 'role', ''))) in (
      'platform_super_admin', 'super_admin'
    ) then 'platform_sa'
    when lower(trim(coalesce(u.raw_app_meta_data ->> 'role', ''))) in (
      'company', 'company_admin', 'company_staff'
    ) then 'company_operator'
    when lower(trim(coalesce(u.raw_app_meta_data ->> 'role', ''))) = 'owner' then 'owner'
    when coalesce(u.raw_user_meta_data ->> 'role', '') <> ''
      or coalesce(u.raw_user_meta_data ->> 'owner_crm_id', '') <> '' then 'legacy_user_metadata_only'
    else 'unclassified'
  end as persona_bucket,
  case
    when lower(trim(coalesce(u.raw_app_meta_data ->> 'role', ''))) in (
      'company', 'company_admin', 'company_staff', 'owner'
    )
    and nullif(trim(coalesce(u.raw_app_meta_data ->> 'company_id', '')), '') is null
    then 'missing_app_company_id'
    when lower(trim(coalesce(u.raw_app_meta_data ->> 'role', ''))) = 'owner'
    and nullif(trim(coalesce(u.raw_app_meta_data ->> 'owner_crm_id', '')), '') is null
    then 'missing_app_owner_crm_id'
    when lower(trim(coalesce(u.raw_app_meta_data ->> 'role', ''))) in (
      'platform_super_admin', 'super_admin'
    )
    and nullif(trim(coalesce(u.raw_app_meta_data ->> 'company_id', '')), '') is not null
    then 'sa_should_not_have_company_id'
    else null
  end as shape_issue
  from auth.users u
)
select
  id,
  email,
  persona_bucket,
  shape_issue,
  app_role,
  app_company_id,
  app_owner_crm_id,
  user_role,
  user_company_id,
  user_owner_crm_id,
  user_metadata_has_authz,
  last_sign_in_at
from classified
order by
  user_metadata_has_authz desc,
  shape_issue nulls last,
  persona_bucket,
  email;

-- ---------------------------------------------------------------------------
-- 3) Users needing user_metadata authz strip (promote blocker)
-- ---------------------------------------------------------------------------
select
  id,
  email,
  raw_user_meta_data ->> 'role' as user_meta_role,
  raw_user_meta_data ->> 'company_id' as user_meta_company_id,
  raw_user_meta_data ->> 'owner_crm_id' as user_meta_owner_crm_id,
  raw_app_meta_data ->> 'role' as app_meta_role
from auth.users
where coalesce(raw_user_meta_data ->> 'role', '') <> ''
   or coalesce(raw_user_meta_data ->> 'company_id', '') <> ''
   or coalesce(raw_user_meta_data ->> 'owner_crm_id', '') <> ''
order by email;

-- ---------------------------------------------------------------------------
-- 4) ALODILA company login candidates / gaps
--     Target: app_metadata.role in (company|company_admin|company_staff)
--             AND company_id = a1000000-a10d-4000-8000-000000000001
--     Note: bare 'staff' is NOT accepted by 006 V2 is_company_login()
-- ---------------------------------------------------------------------------
select
  id,
  email,
  raw_app_meta_data ->> 'role' as app_role,
  raw_app_meta_data ->> 'company_id' as app_company_id,
  case
    when lower(trim(coalesce(raw_app_meta_data ->> 'role', ''))) in (
      'company', 'company_admin', 'company_staff'
    )
    and trim(coalesce(raw_app_meta_data ->> 'company_id', ''))
      = 'a1000000-a10d-4000-8000-000000000001'
    then 'alodila_company_login_ok'
    when lower(trim(coalesce(raw_app_meta_data ->> 'role', ''))) = 'staff'
    then 'invalid_bare_staff_role'
    else 'not_alodila_company_login'
  end as alodila_bind_status
from auth.users
order by alodila_bind_status, email;

-- ---------------------------------------------------------------------------
-- 5) Owner rows — claim vs CRM alignment hint (read-only join)
--     Requires public.owners from PMS schema on same database.
-- ---------------------------------------------------------------------------
select
  u.id as auth_user_id,
  u.email,
  u.raw_app_meta_data ->> 'owner_crm_id' as claimed_owner_crm_id,
  u.raw_app_meta_data ->> 'company_id' as claimed_company_id,
  o.id as owners_id,
  o.company_id as owners_company_id,
  case
    when o.id is null then 'owner_crm_id_not_in_owners_table'
    when u.raw_app_meta_data ->> 'company_id' is distinct from o.company_id::text
    then 'company_id_mismatch'
    when coalesce(u.raw_user_meta_data ->> 'role', '') <> '' then 'strip_user_metadata_authz'
    else 'owner_claim_ok'
  end as owner_alignment
from auth.users u
left join public.owners o
  on o.id::text = nullif(trim(coalesce(u.raw_app_meta_data ->> 'owner_crm_id', '')), '')
where lower(trim(coalesce(u.raw_app_meta_data ->> 'role', ''))) = 'owner'
   or coalesce(u.raw_user_meta_data ->> 'role', '') = 'owner'
   or coalesce(u.raw_user_meta_data ->> 'owner_crm_id', '') <> ''
order by owner_alignment, u.email;

-- ---------------------------------------------------------------------------
-- 6) Platform SA — should not carry company_id in app_metadata
-- ---------------------------------------------------------------------------
select
  id,
  email,
  raw_app_meta_data ->> 'role' as app_role,
  raw_app_meta_data ->> 'company_id' as app_company_id,
  raw_user_meta_data ->> 'role' as user_meta_role
from auth.users
where lower(trim(coalesce(raw_app_meta_data ->> 'role', ''))) in (
        'platform_super_admin', 'super_admin'
      )
   or lower(trim(coalesce(raw_user_meta_data ->> 'role', ''))) in (
        'platform_super_admin', 'super_admin'
      )
order by email;
