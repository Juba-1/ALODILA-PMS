-- ALODILA-PMS Migration: "Assigned Manager" on properties
-- Goal:
-- - Add a lightweight free-text column `assigned_manager` to public.properties
--   so each property can show a responsible manager ("Managed by: Khalid").
-- - Idempotent: safe to run multiple times.
--
-- Rollback (if ever needed):
--   alter table public.properties drop column if exists assigned_manager;

begin;

alter table if exists public.properties
  add column if not exists assigned_manager text null;

comment on column public.properties.assigned_manager is
  'Display name of the team member responsible for this property (free text, optional).';

commit;
