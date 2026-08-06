# Local Supabase Development & Validation Platform

**Production is sacred. This stack is local-only.**

## One command

```bash
npm run local:validate
```

Runs: detect Docker/CLI → start local Supabase if needed → `db reset` (migrations + seed) → authenticated API validation suite → report under `rls-validation/reports/`.

## Companion commands

| Command | Purpose |
|---------|---------|
| `npm run local:start` | Start Docker Supabase stack |
| `npm run local:status` | Show API URL / keys |
| `npm run local:reset` | Replay migrations + seed |
| `npm run local:stop` | Stop stack |
| `npm run rls:validate` | Bare local Postgres GUC harness (no Auth/API) |

## Migration chain (local)

1. `001_baseline_pms_schema.sql` — pre-Package PMS schema + ALODILA company
2. `00501` … `00505` — company_id packages (renamed for unique CLI versions; SQL unchanged)
3. `006_sprint4_soft_rls_v2.sql` — Soft RLS (canonical)
4. `20260805120000_fix_with_check_helpers.sql` — local/clone repair for WITH CHECK recursion + soft-delete SELECT coupling

Quarantined (not applied by reset): see `supabase/quarantine/README.md`.
See also `supabase/MIGRATION_FILENAMES.md`.

## Seed accounts (password: `Password123!`)

| Email | app_metadata |
|-------|----------------|
| staff-a@local.alodila.test | company → ALODILA |
| staff-b@local.alodila.test | company → Company B |
| owner-a@local.alodila.test | owner + owner_crm_id A |
| owner-b@local.alodila.test | owner + owner_crm_id B |
| sa@local.alodila.test | platform_super_admin |
| spoof@local.alodila.test | authz only in user_metadata (must deny) |

Studio: http://127.0.0.1:54323 (after start)
API: http://127.0.0.1:54321
