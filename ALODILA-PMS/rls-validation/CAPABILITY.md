# RLS Validation — Capability Assertion

## What this harness CAN prove

| Capability | How |
|------------|-----|
| Migration 006 V2 applies cleanly on a disposable Postgres | Replay bootstrap + packages + 006 V2 |
| Soft RLS allow/deny for company A vs B (SELECT/INSERT/UPDATE/soft-delete) | `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)` |
| `app_metadata`-only company/owner helpers behave as authored | Claims JSON uses `app_metadata` only |
| `secondary_unit_ids` cross-company WITH CHECK rejects | Synthetic attack rows |
| Parent FK company WITH CHECK rejects | Cross-company unit/tenant attach attempts |
| Owner portal self-scope + company alignment | Owner JWT with `owner_crm_id` + `company_id` |
| Platform SA still bypasses PMS SELECT (soft design) | SA claim → expect visibility (documented, not isolation PASS) |
| user_metadata spoof does **not** grant company/owner authz | Spoof claims → expect deny |

## What this harness CANNOT prove

| Gap | Why |
|-----|-----|
| PostgREST / GoTrue JWT signing & claim injection | Local GUC simulation skips API gateway |
| Real Auth user provisioning / refresh tokens | No Supabase Auth service in this path |
| Production data shape / residual NULL density | Synthetic seed only |
| `CREATE INDEX CONCURRENTLY` (006b) under load | Logic suite skips 006b by design |
| App-layer `withCompanyEq` / React loaders | DB-only harness |
| Network IDOR via anon key against cloud | Not a cloud clone |
| Realtime / Storage / Edge Functions | Out of scope |

## Local PostgreSQL vs Supabase Cloud

| Concern | Local harness | Cloud Supabase |
|---------|---------------|----------------|
| RLS evaluation | Same Postgres RLS engine | Same |
| JWT → GUC | Manual `set_config` | PostgREST sets from verified JWT |
| Roles | Created as `authenticated` / `anon` | Managed by Supabase |
| `auth.uid()` | May differ if policies use it; suite sets `sub` in claims | From JWT `sub` |
| Extensions | `pgcrypto` only as needed | Full managed set |

## What still requires Production / Clone validation

1. Apply 006 V2 on an approved non-prod cloud target (or clone) after local PASS.
2. Smoke ALODILA staff + owner portal with **real** `app_metadata` JWTs.
3. Optional: 006b concurrent indexes on a quiet environment.
4. Isolation QA with real Auth users (`SPRINT4_ISOLATION_QA.md`).

**Local PASS is necessary but not sufficient for Production apply.**
