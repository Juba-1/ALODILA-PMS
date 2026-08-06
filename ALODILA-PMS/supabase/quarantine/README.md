# Quarantined migration artifacts

These files are **intentionally not applied** by `supabase db reset`.

| File | Why quarantined |
|------|-----------------|
| `006_sprint4_soft_rls_and_indexes.sql` | SUPERSEDED abort stub — raises exception |
| `007_company_id_not_null_DRAFT.sql` | Gate B draft abort stub — raises exception |
| `006b_sprint4_wave_a_indexes_concurrent.sql` | `CREATE INDEX CONCURRENTLY` cannot run in migration transactions; also references columns not in baseline |

**Canonical Soft RLS:** `../migrations/006_sprint4_soft_rls_v2.sql`

Content was **not rewritten** — only relocated so the local Supabase migration chain is runnable.
Restore to `migrations/` only when deliberately executing that artifact outside `db reset`.
