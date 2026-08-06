# Sprint 4 — Production Readiness (Soft RLS)

**Product:** ALODILA-PMS  
**Document type:** Production go-live checklist (ops / eng / QA / comms)  
**Status:** DRAFT — **checklist only**; no SQL execution and no clone creation from this document  
**SQL artifact:** `supabase/migrations/006_sprint4_soft_rls_and_indexes.sql` (V2)  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Date:** 2026-08-04  

**Depends on:**  
`SPRINT4_STREAM_D_PACKAGE.md` · `SPRINT4_ISOLATION_QA.md` · `SPRINT4_RLS_DESIGN.md` · `SPRINT4_STATUS.md`

---

## Hard gate (non-negotiable)

| Rule | Enforcement |
|------|-------------|
| Soft RLS on **production** only after **two-company clone isolation PASS** | Phase D5 blocked until §1 Pre-flight is fully checked |
| **Never seed Company B on production** | Isolation proof is clone-only; prod verification is ALODILA-only smoke |
| No `NOT NULL`, no hard cutover, no removal of `is_super_admin()` PMS bypass | Soft / additive only |
| No production deletes or re-parent of ALODILA rows | Forbidden |

**Exit line for production enablement:** *Clone isolation matrix PASS + written approval + ALODILA smoke green → apply soft helpers/policies on prod → Wave A indexes `CONCURRENTLY` outside txn → verify → communicate.*

---

## 1. Pre-flight

Complete **before** any production soft RLS apply. Owner signs each row.

### 1.1 Clone isolation gate

| ☐ | Check | Evidence / notes |
|---|--------|------------------|
| ☐ | Isolated clone restored from a known production backup (not live prod) | Clone project / branch id: ________ |
| ☐ | Soft RLS (helpers → SELECT → INSERT/UPDATE) applied and proven on **clone** | Run log link: ________ |
| ☐ | Two-company isolation matrix **PASS** per `SPRINT4_ISOLATION_QA.md` | Zero cross-read for company-scoped + owner-scoped sessions |
| ☐ | Hotspot / abuse cases PASS (CB filter strip, UUID guess, unauth denied) | |
| ☐ | ALODILA staff (CA) + ALODILA owner portal (OA) smoke green **on clone** after policies | |
| ☐ | Failures (if any) resolved; no open Blocker/Major | Waiver only with design amendment |

### 1.2 Migration 006 V2 approval

| ☐ | Check | Evidence / notes |
|---|--------|------------------|
| ☐ | `006_sprint4_soft_rls_and_indexes.sql` reviewed as **V2** (helpers + policies + Wave A indexes) | Reviewer: ________ |
| ☐ | Streams A / B / C + UPDATE soft-delete gates COMPLETE on the build that will hit prod | Commit / deploy tag: ________ |
| ☐ | Package 5 closed: in-scope tables have `company_id`, backfilled, still nullable | |
| ☐ | Explicit **written approval** to apply soft RLS on production | Approver + date: ________ |
| ☐ | Rollback plan (§3) acknowledged by on-call eng | |

### 1.3 JWT actors on `app_metadata`

Production actors must use **trusted** claims. Prefer `app_metadata`; do not authorize from editable `user_metadata` alone.

| ☐ | Actor | Required claims (preferred path) | Verified |
|---|-------|----------------------------------|----------|
| ☐ | ALODILA staff / company login | `app_metadata.company_id` = ALODILA UUID; role aligns with staff/company path | ☐ |
| ☐ | Super admin (ops) | JWT `role = super_admin` (preserve existing helper) | ☐ |
| ☐ | ALODILA owner portal | `app_metadata.role = owner` + `app_metadata.owner_crm_id` (user_metadata fallback OK for transition) | ☐ |
| ☐ | No production Company B Auth users created for this gate | N/A — clone-only | ☐ |

After each test login: confirm claims via session inspector / `getUser` before smoke.

### 1.4 Backup

| ☐ | Check | Evidence / notes |
|---|--------|------------------|
| ☐ | Fresh production backup / PITR restore point taken **immediately before** prod apply | Backup id / timestamp: ________ |
| ☐ | Backup restoreability confirmed (or recent successful restore drill on clone) | |
| ☐ | Schema inventory of current live RLS policy names captured (for rollback restore) | Snapshot path: ________ |
| ☐ | On-call knows how to revert policies without touching ALODILA business data | |

**Pre-flight exit:** All §1 boxes checked → proceed to §2 Deployment.

---

## 2. Deployment

Apply on **production only** after §1. Same logical order as clone; indexes handled separately on prod.

### 2.1 Order of operations

```
1. Confirm maintenance window / low-traffic window (optional but preferred)
2. Deploy app build with Streams A–C + write stamps already live (or confirm already deployed)
3. Apply soft RLS: helpers → SELECT policies (9 tables) → INSERT/UPDATE policies (same 9)
4. Smoke ALODILA staff + owner portal (§4) before index work
5. Create Wave A indexes with CREATE INDEX CONCURRENTLY — outside any transaction
6. Final smoke + communicate (§5)
```

### 2.2 Helpers + policies first

| ☐ | Step | Notes |
|---|------|-------|
| ☐ | Target **production** project URL confirmed (not clone) | Double-check connection |
| ☐ | Preconditions: `companies` present; ALODILA seed row alive; `is_super_admin()` exists | Fail closed if missing |
| ☐ | **Helpers** applied / preserved: `is_super_admin`, owner helpers, `current_company_id`, `company_matches`, `owner_company_aligned`, etc. | JWT via `current_setting('request.jwt.claims', true)` |
| ☐ | **SELECT** policies OR-extended on all 9 in-scope tables | Order: owners → tenants → properties → units → meters → contracts → invoices → payments → maintenance_requests |
| ☐ | **INSERT / UPDATE** policies on same 9 tables | Owner portal remains read-only on PMS writes |
| ☐ | `public.companies` policies **unchanged** | Company logins must not list SaaS customers |
| ☐ | No Company B seed, no synthetic tenants, no ALODILA re-parent | **Forbidden on prod** |

### 2.3 Indexes — `CONCURRENTLY`, outside transaction

Wave A indexes are performance-only; they must **not** block soft RLS go/no-go.

Authored file uses non-concurrent `CREATE INDEX IF NOT EXISTS` inside a txn (clone-friendly). **On production:**

| ☐ | Check | Notes |
|---|--------|-------|
| ☐ | Helpers + policies committed successfully **before** index work | |
| ☐ | Index DDL run **outside** a wrapping `BEGIN`/`COMMIT` | `CREATE INDEX CONCURRENTLY` cannot run inside a transaction |
| ☐ | Use concurrent equivalents of Wave A indexes (do not drop Package 1–5 solo `*_company_id_idx`) | See index list below |
| ☐ | Monitor for invalid indexes; rebuild if `INVALID` | |
| ☐ | Index failure does **not** require RLS rollback by itself | Fix indexes separately |

**Wave A index set (alive / partial):**

| Index | Table / shape |
|-------|----------------|
| `payments_company_alive_id_idx` | `payments (company_id, id) WHERE is_deleted = false` |
| `invoices_company_alive_id_idx` | `invoices (company_id, id) WHERE is_deleted = false` |
| `invoices_company_alive_due_date_idx` | `invoices (company_id, due_date) WHERE is_deleted = false` |
| `contracts_company_active_end_idx` | `contracts (company_id, end_date) WHERE is_deleted = false AND status = 'ساري'` |
| `units_company_alive_status_idx` | `units (company_id, status) WHERE is_deleted = false` |
| `maint_company_open_idx` | `maintenance_requests (company_id, id) WHERE is_deleted = false AND status IN ('مفتوح', 'قيد المعالجة')` |
| `maint_company_alive_id_idx` | `maintenance_requests (company_id, id) WHERE is_deleted = false` |
| `properties_company_alive_name_idx` | `properties (company_id, name) WHERE is_deleted = false` |

### 2.4 Deployment exit

| ☐ | Check |
|---|--------|
| ☐ | Soft policies live on prod; helpers callable under Auth sessions |
| ☐ | Immediate ALODILA smoke started (§4) |
| ☐ | Indexes concurrent job finished or explicitly deferred with owner sign-off |

---

## 3. Rollback

Reversible soft RLS: prefer policy revert over data changes. **Never** use clone Company B cleanup patterns on production.

### 3.1 When to roll back (production)

| Trigger | Action |
|---------|--------|
| ALODILA staff console lockout / mass empty lists after policy apply | Revert soft company policies immediately |
| ALODILA owner portal broken (portfolio empty / auth errors) | Revert soft policies; preserve owner helper contracts |
| Unexpected write denials for legitimate ALODILA operators | Revert INSERT/UPDATE extensions first if SELECT is healthy |
| Confirmed wrong project targeted | **Stop** — restore from backup / PITR if any damage; escalate |
| Index build failure / bloat | Drop failed Wave A index only; **do not** revert RLS for index issues alone |

Super_admin dual-company visibility is **expected** under soft RLS and is **not** a rollback trigger.

### 3.2 Rollback steps (manual)

| ☐ | Step |
|---|------|
| ☐ | Announce rollback to stakeholders (§5) |
| ☐ | Drop / disable **company_*** (and related soft) policies on the 9 PMS tables |
| ☐ | Restore prior SELECT (and write) policy bodies from live backup / schema snapshot |
| ☐ | Optionally drop Wave A indexes (safe; Package 1–5 solo indexes remain) |
| ☐ | Helpers may remain if inert and unused by policies |
| ☐ | Re-run ALODILA staff + owner portal smoke |
| ☐ | Do **not** delete or re-parent ALODILA production rows as “cleanup” |
| ☐ | Do **not** seed or drop Company B on production (there should be none) |

### 3.3 Rollback complete when

- Soft company predicates no longer enforce (or prior policies restored)
- ALODILA staff console + owner portal match pre-apply baseline
- Incident notes filed; root cause scheduled before next attempt

---

## 4. Verification

Production verification is **ALODILA-only**. Do not create Company B on prod to “re-prove” isolation.

### 4.1 ALODILA staff console smoke

| ☐ | Check | Pass |
|---|--------|------|
| ☐ | Login with production-like company / staff claims (`app_metadata`) | ☐ |
| ☐ | Dashboard loads; KPIs / lists non-empty vs recent baseline | ☐ |
| ☐ | Properties / units / tenants / owners list + open detail | ☐ |
| ☐ | Contracts / invoices / payments read paths | ☐ |
| ☐ | Create or update one low-risk row (or known staging-safe path); `company_id` remains ALODILA | ☐ |
| ☐ | Soft-delete path (if exercised) stays company-scoped; no foreign stamp | ☐ |
| ☐ | Platform `/platform` still denied for non–super-admin company login | ☐ |
| ☐ | Exports / reports / AI loaders return ALODILA-scoped data only (no unexpected empty from policy lockout) | ☐ |

### 4.2 ALODILA owner portal smoke

| ☐ | Check | Pass |
|---|--------|------|
| ☐ | Owner login; JWT role + `owner_crm_id` on `app_metadata` (fallback OK) | ☐ |
| ☐ | Owner dashboard / properties / reports / maintenance widgets | ☐ |
| ☐ | Portfolio matches pre-apply baseline for that owner | ☐ |
| ☐ | Owner cannot INSERT/UPDATE staff PMS tables | ☐ |
| ☐ | Owner cannot access staff console write routes | ☐ |

### 4.3 Post-index smoke (if indexes applied)

| ☐ | Check | Pass |
|---|--------|------|
| ☐ | Same staff + owner smokes still green | ☐ |
| ☐ | No `INVALID` Wave A indexes | ☐ |

### 4.4 Verification exit

| ☐ | Result |
|---|--------|
| ☐ | Staff + owner smoke PASS → proceed to §5 Communication (success) |
| ☐ | Any lockout / empty-baseline FAIL → §3 Rollback before further changes |

---

## 5. Communication

### 5.1 Before apply

| ☐ | Message | Audience |
|---|---------|----------|
| ☐ | Window start time, expected duration, soft RLS purpose (isolation backstop; ALODILA behavior preserved) | Internal eng / ops |
| ☐ | Rollback owner + backup id recorded | Eng lead |
| ☐ | “No second company on prod; isolation already proven on clone” stated in runbook | All operators |

### 5.2 During apply

| ☐ | Update | Audience |
|----|--------|----------|
| ☐ | Helpers+policies applied / in progress | On-call channel |
| ☐ | Smoke started / smoke result | On-call channel |
| ☐ | Index concurrent status (running / done / deferred) | On-call channel |

### 5.3 After success

| ☐ | Message | Audience |
|---|---------|----------|
| ☐ | Soft RLS live on prod; ALODILA staff + owner portal verified | Product / eng |
| ☐ | Clone PASS reference + prod apply time + deploy tag logged | Run log |
| ☐ | Remind: next real multi-tenant customer is a later milestone — not this gate | Product |

### 5.4 After rollback / abort

| ☐ | Message | Audience |
|---|---------|----------|
| ☐ | Soft RLS reverted or apply aborted; ALODILA baseline restored | Product / eng / support |
| ☐ | Symptom, trigger, backup id, next retry conditions | Incident notes |
| ☐ | Explicit: do not seed Company B on prod while debugging | All operators |

---

## 6. Sign-off

| Role | Name | Date | ☐ |
|------|------|------|---|
| Eng lead (006 V2 + prod apply) | | | ☐ |
| QA (clone PASS + prod smoke) | | | ☐ |
| Ops / on-call (backup + rollback ready) | | | ☐ |
| Product (comms / customer impact) | | | ☐ |

---

## Document control

| Field | Value |
|-------|--------|
| Author role | Production Readiness Agent |
| Deliverable | `docs/SPRINT4_PRODUCTION_READINESS.md` only |
| SQL execution | **None** from this document |
| Clone creation | **None** from this document |
| Company B on production | **Forbidden** |
| Soft RLS on production | **Only after clone isolation PASS + written approval** |

*End of Sprint 4 production readiness checklist*
