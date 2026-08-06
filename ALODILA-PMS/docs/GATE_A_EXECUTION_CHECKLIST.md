# Gate A — Execution Checklist (NEXT HUMAN ACTION)

**Status:** Ready to execute when you approve clone creation  
**Optimized roadmap:** `ROADMAP_OPTIMIZED_V2.md`  
**Production runbook:** `PRODUCTION_SOFT_RLS_RUNBOOK.md`  
**Blocks:** Production soft RLS, Company B, billing

---

## Why Gate A

Gate A is the **mandatory clone campaign** before any Production Soft RLS apply. A local Supabase Docker stack now provides a **partial substitute** for migration authoring and automated API validation (`npm run local:validate` → **22/22 PASS**, 2026-08-05; production **untouched**). That local pass **does not** replace clone: production-like data, Auth personas on a real Supabase project, and the two-company isolation matrix still require an isolated clone before Production.

---

## Steps (in order)

| # | Action | Doc / artifact | Done when |
|---|--------|----------------|-----------|
| 1 | Create Supabase project `ALODILA-PMS-clone` | `CLONE_STANDUP_COMMANDS.md` | Project URL exists ≠ prod |
| 2 | Fresh dump from prod `ryfqqyrqmsyngwcsfjug` (AFTER Package 5) | Same | Dump file non-empty, dated |
| 3 | Restore into clone only | Same | Packages 1–5 present on clone |
| 4 | Point local app at `.env.clone` | Same | App loads against clone |
| 5 | Provision CA/CB/OA/OB + ALODILA **company** login via **app_metadata** | `AUTH_RELEASE_MIGRATION_KIT.md` · `SPRINT5_AUTH_CUTOVER_PLAN.md` | JWT claims verified |
| 6 | Capture `pg_policies` backup on clone | `ROLLBACK_PACK_SOFT_RLS.md` §2 | Backup file saved |
| 7 | Apply `006_sprint4_soft_rls_v2.sql` on **clone** | `supabase/migrations/006_sprint4_soft_rls_v2.sql` | Helpers + policies present |
| 8 | Apply `20260805120000_fix_with_check_helpers.sql` on **clone** **immediately after step 7** | `supabase/migrations/20260805120000_fix_with_check_helpers.sql` | WITH CHECK helpers fixed; no contracts recursion |
| 9 | *(Optional, off-peak)* Apply `006b_sprint4_wave_a_indexes_concurrent.sql` | Migration file — **outside** 006 txn | Indexes present |
| 10 | Run isolation matrix | `SPRINT4_ISOLATION_QA.md` | Exit rows 1–10 PASS |
| 11 | Written go/no-go for Gate B / prod | `SPRINT4_PRODUCTION_READINESS.md` · `PRODUCTION_SOFT_RLS_RUNBOOK.md` §6 | Decision recorded |

**Hard rules:**

| Rule | Reason |
|------|--------|
| Never restore onto prod | Data loss |
| Never apply 006 V1 (`006_sprint4_soft_rls_and_indexes.sql`) | Superseded abort stub |
| Never apply step 7 **without** step 8 | Contracts recursion + soft-delete breakage |
| Never apply `007_company_id_not_null_DRAFT.sql` in Gate A | Gate B only |
| Never run 006b **inside** the 006 V2 transaction | `CONCURRENTLY` forbidden in txn |
| Never score isolation using SA dual visibility | SA bypass is expected, not evidence |

---

## Local validation (already done — not a Gate A substitute)

| Check | Status | Command / evidence |
|-------|--------|-------------------|
| Local Docker API suite | ✅ **22/22 PASS** (2026-08-05) | `npm run local:validate` |
| Production touched | ✅ **NO** | `rls-validation/reports/local-api-validation-2026-08-05T10-51-30-498Z.md` |

Re-run locally after migration edits: `npm run local:reset && npm run local:validate`. Clone Gate A still required before Production.

---

## After Gate A PASS

→ Gate B: `007_company_id_not_null_DRAFT.sql` (un-abort after zero-NULL proof) + claim harden  
→ Gate C: Company B beta + assume-company  
→ Gate D: Billing stub  
→ Production Soft RLS: `PRODUCTION_SOFT_RLS_RUNBOOK.md` (only after this checklist PASS + written approval)

---

*This is the single next optimal execution plan.*
