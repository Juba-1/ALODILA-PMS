-- ALODILA-PMS Migration: optional secondary units on contracts (bulk / B2B leasing)
-- Goal:
-- - Add `secondary_unit_ids` JSONB array on public.contracts for additional linked units.
-- - Default empty array; idempotent.
--
-- Rollback (if ever needed):
--   alter table public.contracts drop column if exists secondary_unit_ids;

begin;

alter table if exists public.contracts
  add column if not exists secondary_unit_ids jsonb not null default '[]'::jsonb;

comment on column public.contracts.secondary_unit_ids is
  'Optional UUID array of additional units leased under the same contract (B2B bulk leasing).';

commit;
