# Migration filename notes (local CLI)

## Soft RLS apply order (Gate A / Production)

1. `006_sprint4_soft_rls_v2.sql`
2. `20260805120000_fix_with_check_helpers.sql`

Never apply (1) without (2) in the same maintenance window.

## Package renames (CLI version uniqueness)

Supabase CLI stores one `version` key per file (prefix before `_`).

| Before | After |
|--------|-------|
| `005_package_1_crm_roots.sql` | `00501_package_1_crm_roots.sql` |
| `005_package_2_properties.sql` | `00502_package_2_properties.sql` |
| `005_package_3_units_meters.sql` | `00503_package_3_units_meters.sql` |
| `005_package_4_contracts.sql` | `00504_package_4_contracts.sql` |
| `005_package_5_finance_operational.sql` | `00505_package_5_finance_operational.sql` |

SQL bodies unchanged. Local baseline `001_baseline_pms_schema.sql` is for Docker replay only — **not** applied to Production (Packages 1–5 already live).

## Quarantine

See `../quarantine/README.md` — V1 abort, 007 draft, 006b CONCURRENTLY.

## Production apply note

Production Soft RLS is the **pair** above as ordered SQL scripts on an approved target. Do not `db push` the entire local baseline chain onto Production.
