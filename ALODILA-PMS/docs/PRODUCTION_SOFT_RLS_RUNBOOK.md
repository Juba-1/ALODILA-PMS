# Production Soft RLS — Release Runbook

**Product:** ALODILA-PMS  
**Document type:** Production apply runbook (documentation only)  
**Status:** **NO-GO** — Production Soft RLS not approved; clone Gate A incomplete  
**Production ref:** `ryfqqyrqmsyngwcsfjug`  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Date:** 2026-08-05  

**Companion docs (execute from these, not this file alone):**  
`GATE_A_EXECUTION_CHECKLIST.md` · `CLONE_STANDUP_COMMANDS.md` · `SPRINT5_AUTH_CUTOVER_PLAN.md` · `AUTH_RELEASE_MIGRATION_KIT.md` · `SPRINT4_ISOLATION_QA.md` · `ROLLBACK_PACK_SOFT_RLS.md` · `SPRINT4_PRODUCTION_READINESS.md`

---

## ⚠️ Do not execute from this document alone

This runbook is the **production decision and apply-order SSOT**. It does **not** replace clone stand-up, Auth provisioning, isolation QA, or rollback rehearsal. Every production step requires:

1. Gate A **PASS** on an isolated clone (written evidence).
2. Written owner approval naming production ref `ryfqqyrqmsyngwcsfjug`.
3. Pre-apply `pg_policies` backup per `ROLLBACK_PACK_SOFT_RLS.md` §2.

**Current verdict:** Local Docker validation **22/22 PASS** (2026-08-05). **Production UNTOUCHED.** **NO-GO** for Production Soft RLS until Gate A clone campaign completes.

---

## 1. Preconditions

Complete **all** before any production apply. Packages 1–5 are **already on Production**; Soft RLS is **not**.

| # | Precondition | Evidence |
|---|--------------|----------|
| P1 | Packages 1–5 applied on prod (`company_id` columns, ALODILA backfill, FKs) | Already live |
| P2 | App Streams A–D deployed (adapter, stamps, read filters, UPDATE gates) | Deploy tag recorded |
| P3 | **Gate A PASS** on isolated clone: Auth bind + 006 V2 + fix helpers + isolation matrix | `GATE_A_EXECUTION_CHECKLIST.md` signed |
| P4 | Auth personas on clone use **`app_metadata` only** (CA/CB/OA/OB + ALODILA company login) | `AUTH_RELEASE_MIGRATION_KIT.md` · `SPRINT5_AUTH_CUTOVER_PLAN.md` |
| P5 | Local validation green (sanity, not prod substitute) | `npm run local:validate` → 22/22 PASS (2026-08-05) |
| P6 | Pre-apply `pg_policies` dump on **production** | `ROLLBACK_PACK_SOFT_RLS.md` §2 — dated file saved |
| P7 | Fresh production backup / PITR point immediately before apply | Backup id + timestamp |
| P8 | Written production approval (owner + on-call eng) | Approver + date |
| P9 | Rollback pack rehearsed on clone | `ROLLBACK_PACK_SOFT_RLS.md` run log |

**Hard prohibitions (any environment):**

| Never | Reason |
|-------|--------|
| Apply `006_sprint4_soft_rls_v2.sql` **without** `20260805120000_fix_with_check_helpers.sql` immediately after | Contracts recursion; soft-delete / WITH CHECK breakage |
| Apply `006_sprint4_soft_rls_and_indexes.sql` (V1 abort stub) | Superseded; unsafe |
| Apply `007_company_id_not_null_DRAFT.sql` in this gate | Gate B only — after zero-NULL proof |
| Run `006b_sprint4_wave_a_indexes_concurrent.sql` **inside** the 006 V2 transaction | `CONCURRENTLY` cannot run in a transaction block |
| Restore clone dump onto production | Data loss risk |
| Seed Company B on production | Clone-only isolation proof |

---

## 2. Exact apply order (clone first, then production)

### 2.1 Clone (Gate A — mandatory rehearsal)

Execute on **clone only** (`ALODILA-PMS-clone` or approved branch). See `GATE_A_EXECUTION_CHECKLIST.md` for full steps.

```
1. Restore prod dump → clone
2. Auth bind (app_metadata) — AUTH_RELEASE_MIGRATION_KIT.md
3. pg_policies pre-apply backup — ROLLBACK_PACK_SOFT_RLS.md §2
4. Apply 006_sprint4_soft_rls_v2.sql          ← transaction
5. Apply 20260805120000_fix_with_check_helpers.sql   ← transaction, IMMEDIATELY after step 4
6. (Optional, off-peak) 006b_sprint4_wave_a_indexes_concurrent.sql — OUTSIDE any 006 txn; after column audit
7. Isolation matrix — SPRINT4_ISOLATION_QA.md
8. Written go/no-go
```

**Rule:** Steps 4 and 5 are an **atomic pair**. Never pause production promotion between them.

### 2.2 Production (only after Gate A PASS + §1 complete)

```
1. Confirm connection ref ≠ clone; ref = ryfqqyrqmsyngwcsfjug with written approval
2. pg_policies pre-apply backup (mandatory)
3. Fresh prod backup / PITR
4. Apply 006_sprint4_soft_rls_v2.sql
5. Apply 20260805120000_fix_with_check_helpers.sql   ← same session / maintenance window
6. Smoke tests (§4) — ALODILA-only; no Company B seed
7. (Optional, off-peak) 006b CONCURRENTLY — after §1.2 column audit in SPRINT4_PRODUCTION_READINESS.md
8. Monitor + communicate per SPRINT4_PRODUCTION_READINESS.md §4
```

**006b timing:** Optional performance wave. Run **off-peak**, **outside** the 006 transaction, only after confirming indexed columns exist and match Wave A inventory. Failure of 006b does not require policy rollback.

---

## 3. Auth bind prerequisite

Soft RLS isolation is **not provable** without trusted JWT claims. Before apply (clone or prod):

| Persona | Required `app_metadata` | Doc |
|---------|-------------------------|-----|
| ALODILA company login (CA) | `{ "role": "company", "company_id": "a1000000-a10d-4000-8000-000000000001" }` | `SPRINT5_AUTH_CUTOVER_PLAN.md` §2 |
| Company B operator (CB) | `{ "role": "company", "company_id": "<Company B UUID>" }` | Clone only |
| Owner A / B (OA, OB) | `{ "role": "owner", "owner_crm_id": "<uuid>", "company_id": "<uuid>" }` | Clone only |
| Platform SA | `{ "role": "platform_super_admin" }` — **no** `company_id` | Prep / platform smoke only |

**Execute provisioning from:** `AUTH_RELEASE_MIGRATION_KIT.md` (ordered Admin API / service-role steps).  
**Verify:** Force re-login; inspect JWT before any smoke or isolation row.

**Production minimum before prod apply:** ALODILA **company** login bound; SA separated from day-to-day PMS. CB/OA/OB required on **clone** for Gate A; not seeded on prod.

---

## 4. Smoke tests

### 4.1 Automated (local Docker — already PASS)

Local Supabase stack validation (does **not** replace clone Gate A):

| Command | Purpose |
|---------|---------|
| `npm run local:validate` | Full local API suite (22 cases) |
| `npm run rls:validate` | Standalone RLS pipeline (`rls-validation/`) |
| `npm run local:reset` | Reset local DB before re-run |

**Latest result:** 22/22 PASS · Production touched: **NO** · Report: `rls-validation/reports/local-api-validation-2026-08-05T10-51-30-498Z.md`

### 4.2 Manual smoke matrix (clone + production)

Run as **CA / CB / OA / OB** — never score isolation using Super Admin visibility.

| # | Case | Actor | Pass criteria |
|---|------|-------|---------------|
| S1 | Company SELECT scope | CA | Sees ALODILA rows only |
| S2 | Cross-company IDOR | CA | Cannot SELECT Company B property/unit/tenant |
| S3 | Owner portal scope | OA | Portfolio read-only; no Company B |
| S4 | `user_metadata` spoof | Attacker session | `company_id` in `user_metadata` does **not** grant SELECT |
| S5 | Soft-delete visibility | CA | Can soft-delete own row; RLS coupling per design |
| S6 | `secondary_unit_ids` same company | CA | INSERT with valid secondary units **PASS** |
| S7 | `secondary_unit_ids` cross-company | CA | INSERT with other-company unit id **FAIL** |
| S8 | Cross-company INSERT stamp | CA | INSERT with foreign `company_id` **FAIL** |
| S9 | Cross-parent INSERT | CA | Child under other company's parent **FAIL** |
| S10 | Hard DELETE | CA | Blocked (no DELETE policy) |

**Clone:** Full matrix including CB/OA/OB per `SPRINT4_ISOLATION_QA.md` rows 1–10.  
**Production:** ALODILA-only subset (S1, S3, S5, S6, S8–S10 as applicable) — **no Company B**.

---

## 5. Rollback

On failure after apply:

| Scope | Action |
|-------|--------|
| Clone FAIL | Full policy rollback per `ROLLBACK_PACK_SOFT_RLS.md` §3–§5 |
| Prod FAIL (rare) | Written approval required; same pack; prefer pre-apply backup restore |
| 006b only | Optional index drop §6 — independent of policy rollback |

**Pre-requisite for any rollback:** Pre-apply `pg_policies` dump from §2 step 2 / Gate A step 6.

---

## 6. GO criteria — clone → production

All must be **true** to move from clone rehearsal to production apply:

| # | Criterion |
|---|-----------|
| G1 | Gate A checklist fully checked (`GATE_A_EXECUTION_CHECKLIST.md`) |
| G2 | `006_sprint4_soft_rls_v2.sql` **and** `20260805120000_fix_with_check_helpers.sql` applied on clone as a pair |
| G3 | Two-company isolation matrix **PASS** (CA/CB/OA/OB; zero cross-read/write) per `SPRINT4_ISOLATION_QA.md` |
| G4 | Manual smoke §4.2 complete on clone |
| G5 | Auth bind verified — company login ops smoke green; SA not used for isolation proof |
| G6 | Rollback rehearsed on clone with pre-apply backup |
| G7 | `SPRINT4_PRODUCTION_READINESS.md` §1 Pre-flight signed |
| G8 | Written production approval recorded |
| G9 | Maintenance window + on-call assigned |

**If any G-row fails → NO-GO.** Fix on clone; do not promote partial apply to production.

---

## 7. Current status snapshot

| Layer | Status |
|-------|--------|
| Production Packages 1–5 | ✅ Applied |
| Production Soft RLS (006 + fix) | ❌ **Not applied** — **NO-GO** |
| Local Docker validation | ✅ 22/22 PASS (2026-08-05) |
| Clone Gate A | ⏳ Pending — clone project + Auth + apply + QA |
| 006b indexes | ⏳ Optional; off-peak after audit |

---

*Release Runbook Owner · Soft RLS production apply SSOT · Execute via companion docs only*
