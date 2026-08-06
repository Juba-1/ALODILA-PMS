-- ALODILA-PMS Migration: 007 DRAFT — company_id NOT NULL (Gate B)
-- =============================================================================
-- STATUS: AUTHORED DRAFT ONLY — DO NOT EXECUTE.
-- Gate: B (after Gate A isolation PASS + zero-NULL proof on clone).
-- Prerequisite queries (run read-only first on clone):
--   SELECT 'owners' t, count(*) FILTER (WHERE company_id IS NULL) n FROM owners
--   UNION ALL ... (all 9 PMS tables) — every n must be 0.
-- =============================================================================

do $$
begin
  raise exception
    '007 NOT NULL draft: do not execute until Gate A PASS + zero-NULL proof + written approval.';
end $$;

-- When approved, replace abort with (clone first, then prod):
--
-- begin;
-- alter table public.owners alter column company_id set not null;
-- alter table public.tenants alter column company_id set not null;
-- alter table public.properties alter column company_id set not null;
-- alter table public.units alter column company_id set not null;
-- alter table public.meters alter column company_id set not null;
-- alter table public.contracts alter column company_id set not null;
-- alter table public.invoices alter column company_id set not null;
-- alter table public.payments alter column company_id set not null;
-- alter table public.maintenance_requests alter column company_id set not null;
-- commit;
--
-- Then tighten company_matches() to drop soft-NULL ALODILA branch (separate helper migration).
