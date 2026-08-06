-- ALODILA-PMS Migration: 006 V1 — SUPERSEDED (do not execute)
-- =============================================================================
-- SUPERSEDED BY:
--   supabase/migrations/006_sprint4_soft_rls_v2.sql
--   supabase/migrations/006b_sprint4_wave_a_indexes_concurrent.sql
--
-- Reasons V1 must not be applied:
--   - Policy name drift (properties_select_policy vs live owner_view_own_properties)
--   - Helper/app mismatch (SA→ALODILA vs NULL)
--   - user_metadata trusted for company login (spoof)
--   - auth.uid branches without company_matches
--   - Indexes inside BEGIN/COMMIT (no CONCURRENTLY)
--   - No parent FK WITH CHECK
--
-- See docs/SPRINT4_RLS_POLICY_INVENTORY.md
-- =============================================================================

do $$
begin
  raise exception
    '006 V1 is SUPERSEDED. Apply 006_sprint4_soft_rls_v2.sql (and 006b indexes) instead.';
end $$;
