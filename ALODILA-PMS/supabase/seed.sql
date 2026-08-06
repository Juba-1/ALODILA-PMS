-- =============================================================================
-- supabase/seed.sql — deterministic multi-tenant seed for LOCAL only
-- Runs after migrations on `supabase db reset`. Never for Production.
-- ALODILA = isolation Company A; Company B = peer tenant.
-- =============================================================================

-- Fixed auth users (local GoTrue). Password for all: Password123!
-- bcrypt hash generated for Password123!
do $$
declare
  v_pw text := crypt('Password123!', gen_salt('bf'));
begin
  -- Staff A (company ALODILA)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated',
    'staff-a@local.alodila.test',
    v_pw,
    now(),
    jsonb_build_object(
      'provider', 'email', 'providers', array['email'],
      'role', 'company',
      'company_id', 'a1000000-a10d-4000-8000-000000000001'
    ),
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  ) on conflict (id) do update set
    raw_app_meta_data = excluded.raw_app_meta_data,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = now();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated',
    'staff-b@local.alodila.test',
    v_pw,
    now(),
    jsonb_build_object(
      'provider', 'email', 'providers', array['email'],
      'role', 'company',
      'company_id', 'b2000000-b20d-4000-8000-000000000002'
    ),
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  ) on conflict (id) do update set
    raw_app_meta_data = excluded.raw_app_meta_data,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = now();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated',
    'owner-a@local.alodila.test',
    v_pw,
    now(),
    jsonb_build_object(
      'provider', 'email', 'providers', array['email'],
      'role', 'owner',
      'owner_crm_id', 'a0a00000-0000-4000-8000-0000000000a1',
      'company_id', 'a1000000-a10d-4000-8000-000000000001'
    ),
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  ) on conflict (id) do update set
    raw_app_meta_data = excluded.raw_app_meta_data,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = now();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-8444-444444444444',
    'authenticated', 'authenticated',
    'owner-b@local.alodila.test',
    v_pw,
    now(),
    jsonb_build_object(
      'provider', 'email', 'providers', array['email'],
      'role', 'owner',
      'owner_crm_id', 'b0b00000-0000-4000-8000-0000000000b1',
      'company_id', 'b2000000-b20d-4000-8000-000000000002'
    ),
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  ) on conflict (id) do update set
    raw_app_meta_data = excluded.raw_app_meta_data,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = now();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '99999999-9999-4999-8999-999999999999',
    'authenticated', 'authenticated',
    'sa@local.alodila.test',
    v_pw,
    now(),
    jsonb_build_object(
      'provider', 'email', 'providers', array['email'],
      'role', 'platform_super_admin'
    ),
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  ) on conflict (id) do update set
    raw_app_meta_data = excluded.raw_app_meta_data,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = now();

  -- Spoof candidate: authz ONLY in user_metadata (must not grant access)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '55555555-5555-4555-8555-555555555555',
    'authenticated', 'authenticated',
    'spoof@local.alodila.test',
    v_pw,
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object(
      'role', 'company',
      'company_id', 'a1000000-a10d-4000-8000-000000000001'
    ),
    now(), now(), '', '', '', ''
  ) on conflict (id) do update set
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = now();
end $$;

-- Identities (required for email login on newer GoTrue)
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  u.id, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', u.id::text, now(), now(), now()
from auth.users u
where u.email like '%@local.alodila.test'
on conflict do nothing;

-- Company B registry (ALODILA already in 001 baseline)
insert into public.companies (id, name, slug, status, notes, is_deleted)
values (
  'b2000000-b20d-4000-8000-000000000002'::uuid,
  'Company B',
  'company-b',
  'active',
  'Local isolation peer',
  false
)
on conflict (id) do update set is_deleted = false, name = excluded.name;

-- Optional labeled Company A alias row (separate from ALODILA for registry demos)
insert into public.companies (id, name, slug, status, notes, is_deleted)
values (
  'c3000000-c30d-4000-8000-000000000003'::uuid,
  'Company A',
  'company-a',
  'active',
  'Named Company A (registry). Isolation fixtures use ALODILA as Company A tenant.',
  false
)
on conflict (id) do update set is_deleted = false;

insert into public.owners (id, full_name, national_id, phone, company_id, is_deleted) values
  ('a0a00000-0000-4000-8000-0000000000a1'::uuid, 'Owner A', '1000000001', '0500000001',
   'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000b1'::uuid, 'Owner B', '2000000002', '0500000002',
   'b2000000-b20d-4000-8000-000000000002'::uuid, false),
  ('a0a00000-0000-4000-8000-00000000dead'::uuid, 'Owner A Deleted', '1000000099', '0500000099',
   'a1000000-a10d-4000-8000-000000000001'::uuid, true)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = excluded.is_deleted;

insert into public.tenants (
  id, national_id_or_cr, full_name, tenant_type, phone, national_address, company_id, is_deleted
) values
  ('a0a00000-0000-4000-8000-0000000000a2'::uuid, 'T-A-001', 'Tenant A', 'Individual', '0510000001', 'Riyadh A',
   'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000a2'::uuid, 'T-B-001', 'Tenant B', 'Individual', '0510000002', 'Jeddah B',
   'b2000000-b20d-4000-8000-000000000002'::uuid, false)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = false;

insert into public.properties (
  id, name, type, total_units_capacity, owner_id, owner_crm_id, company_id, is_deleted
) values
  ('a0a00000-0000-4000-8000-0000000000a3'::uuid, 'Property A', 'Residential', 10,
   '11111111-1111-4111-8111-111111111111'::uuid,
   'a0a00000-0000-4000-8000-0000000000a1'::uuid,
   'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000a3'::uuid, 'Property B', 'Residential', 10,
   '22222222-2222-4222-8222-222222222222'::uuid,
   'b0b00000-0000-4000-8000-0000000000b1'::uuid,
   'b2000000-b20d-4000-8000-000000000002'::uuid, false)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = false;

insert into public.units (
  id, property_id, unit_name, type, target_rent_value, company_id, is_deleted
) values
  ('a0a00000-0000-4000-8000-0000000000d1'::uuid, 'a0a00000-0000-4000-8000-0000000000a3'::uuid,
   'A-101', 'Residential', 1000, 'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('a0a00000-0000-4000-8000-0000000000d2'::uuid, 'a0a00000-0000-4000-8000-0000000000a3'::uuid,
   'A-102', 'Residential', 1100, 'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000d1'::uuid, 'b0b00000-0000-4000-8000-0000000000a3'::uuid,
   'B-101', 'Residential', 2000, 'b2000000-b20d-4000-8000-000000000002'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000d2'::uuid, 'b0b00000-0000-4000-8000-0000000000a3'::uuid,
   'B-102', 'Residential', 2100, 'b2000000-b20d-4000-8000-000000000002'::uuid, false)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = false;

insert into public.meters (
  id, property_id, meter_type, pool_quantity, unit_id, company_id, is_deleted
) values
  ('a0a00000-0000-4000-8000-0000000000e2'::uuid, 'a0a00000-0000-4000-8000-0000000000a3'::uuid,
   'electricity', 5, 'a0a00000-0000-4000-8000-0000000000d1'::uuid,
   'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000e2'::uuid, 'b0b00000-0000-4000-8000-0000000000a3'::uuid,
   'water', 3, 'b0b00000-0000-4000-8000-0000000000d1'::uuid,
   'b2000000-b20d-4000-8000-000000000002'::uuid, false)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = false;

insert into public.contracts (
  id, unit_id, tenant_id, start_date, end_date, contract_value, deposit,
  billing_cycle, status, secondary_unit_ids, company_id, is_deleted
) values
  ('a0a00000-0000-4000-8000-0000000000cc'::uuid,
   'a0a00000-0000-4000-8000-0000000000d1'::uuid,
   'a0a00000-0000-4000-8000-0000000000a2'::uuid,
   '2026-01-01', '2026-12-31', 12000, 1000, 'monthly', 'active',
   '["a0a00000-0000-4000-8000-0000000000d2"]'::jsonb,
   'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000cc'::uuid,
   'b0b00000-0000-4000-8000-0000000000d1'::uuid,
   'b0b00000-0000-4000-8000-0000000000a2'::uuid,
   '2026-01-01', '2026-12-31', 24000, 2000, 'monthly', 'active',
   '[]'::jsonb,
   'b2000000-b20d-4000-8000-000000000002'::uuid, false)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = false;

insert into public.invoices (
  id, contract_id, due_date, subtotal_amount, vat_applicable, total_amount, company_id, is_deleted
) values
  ('a0a00000-0000-4000-8000-0000000000f2'::uuid, 'a0a00000-0000-4000-8000-0000000000cc'::uuid,
   '2026-02-01', 1000, false, 1000, 'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000f2'::uuid, 'b0b00000-0000-4000-8000-0000000000cc'::uuid,
   '2026-02-01', 2000, false, 2000, 'b2000000-b20d-4000-8000-000000000002'::uuid, false)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = false;

insert into public.payments (
  id, invoice_id, payment_date, amount, company_id, is_deleted
) values
  ('a0a00000-0000-4000-8000-0000000000e1'::uuid, 'a0a00000-0000-4000-8000-0000000000f2'::uuid,
   '2026-02-02', 500, 'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000e1'::uuid, 'b0b00000-0000-4000-8000-0000000000f2'::uuid,
   '2026-02-02', 800, 'b2000000-b20d-4000-8000-000000000002'::uuid, false)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = false;

insert into public.maintenance_requests (
  id, unit_id, description, cost_amount, status, company_id, is_deleted
) values
  ('a0a00000-0000-4000-8000-0000000000ac'::uuid, 'a0a00000-0000-4000-8000-0000000000d1'::uuid,
   'AC fix A', 150, 'open', 'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000ac'::uuid, 'b0b00000-0000-4000-8000-0000000000d1'::uuid,
   'Pipe fix B', 220, 'open', 'b2000000-b20d-4000-8000-000000000002'::uuid, false)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = false;
