-- rls-validation/sql/90_seed_synthetic.sql
-- Deterministic multi-tenant synthetic data + malicious edge-case fixtures.
-- Applied as superuser AFTER Packages 1–5 + 006 V2.
-- Fixed UUIDs — do not randomize.

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'staff-a@harness.local'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'staff-b@harness.local'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'owner-auth-a@harness.local'),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'owner-auth-b@harness.local')
on conflict (id) do nothing;

insert into public.owners (id, full_name, national_id, phone, company_id, is_deleted) values
  ('a0a00000-0000-4000-8000-0000000000a1'::uuid, 'Owner A', '1000000001', '0500000001',
   'a1000000-a10d-4000-8000-000000000001'::uuid, false),
  ('b0b00000-0000-4000-8000-0000000000b1'::uuid, 'Owner B', '2000000002', '0500000002',
   'b2000000-b20d-4000-8000-000000000002'::uuid, false)
on conflict (id) do update set company_id = excluded.company_id, is_deleted = false;

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

insert into public.owners (id, full_name, national_id, phone, company_id, is_deleted) values
  ('a0a00000-0000-4000-8000-00000000dead'::uuid, 'Owner A Deleted', '1000000099', '0500000099',
   'a1000000-a10d-4000-8000-000000000001'::uuid, true)
on conflict (id) do update set is_deleted = true;
