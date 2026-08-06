-- ALODILA-PMS Migration: 006b — Wave A indexes (CONCURRENTLY)
-- =============================================================================
-- STATUS: AUTHORED ONLY — DO NOT EXECUTE until 006 V2 policies applied on clone
--         and isolation smoke is green (or apply on empty clone after 006 V2).
--
-- WHY SEPARATE FILE:
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--   V1 bundled indexes inside BEGIN/COMMIT — unsafe for production.
--
-- RULES:
--   - Run each statement OUTSIDE an explicit transaction.
--   - Prefer off-peak on production.
--   - DO NOT DROP Package 1–5 solo *_company_id_idx in this migration.
--   - Skip redundant maint_company_open_idx (subset of alive id index).
-- =============================================================================

-- Ledger / list paging
create index concurrently if not exists payments_company_alive_id_idx
  on public.payments (company_id, id)
  where is_deleted = false;

create index concurrently if not exists invoices_company_alive_id_idx
  on public.invoices (company_id, id)
  where is_deleted = false;

create index concurrently if not exists invoices_company_alive_due_date_idx
  on public.invoices (company_id, due_date)
  where is_deleted = false;

-- Active contracts / alerts
create index concurrently if not exists contracts_company_active_end_idx
  on public.contracts (company_id, end_date)
  where is_deleted = false and status = 'ساري';

-- Units inventory
create index concurrently if not exists units_company_alive_status_idx
  on public.units (company_id, status)
  where is_deleted = false;

-- Maintenance lists (single alive composite — drop open-only redundancy from V1)
create index concurrently if not exists maint_company_alive_id_idx
  on public.maintenance_requests (company_id, id)
  where is_deleted = false;

-- Properties name sort / portal
create index concurrently if not exists properties_company_alive_name_idx
  on public.properties (company_id, name)
  where is_deleted = false;

-- Owner portal + EXISTS graph hot path (missing on live)
create index concurrently if not exists properties_owner_crm_alive_idx
  on public.properties (owner_crm_id)
  where is_deleted = false and owner_crm_id is not null;

-- Month revenue / ledger by payment_date
create index concurrently if not exists payments_company_alive_payment_date_idx
  on public.payments (company_id, payment_date)
  where is_deleted = false;

-- =============================================================================
-- ROLLBACK: drop index concurrently if not needed (optional; solos remain)
-- =============================================================================
