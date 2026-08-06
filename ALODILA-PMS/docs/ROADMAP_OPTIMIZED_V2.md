# ALODILA-PMS — Optimized Remaining Roadmap v2

## Release Engine status

**As of 2026-08-05** · Owner: Release Runbook · SSOT: `PRODUCTION_SOFT_RLS_RUNBOOK.md` · `GATE_A_EXECUTION_CHECKLIST.md`

| Signal | Status |
|--------|--------|
| Production Packages 1–5 | ✅ Live on `ryfqqyrqmsyngwcsfjug` |
| Production Soft RLS (006 V2 + fix helpers) | ❌ **NO-GO** — not applied |
| Local Docker validation | ✅ **22/22 PASS** (`npm run local:validate`; prod untouched) |
| Gate A (clone + Auth + 006 pair + isolation QA) | ⏳ **Pending** — clone not stood up |
| Migration pair (apply order) | `006_sprint4_soft_rls_v2.sql` → `20260805120000_fix_with_check_helpers.sql` — **never 006 alone** |
| 006b CONCURRENTLY indexes | ⏳ Optional off-peak after column audit; outside 006 txn |
| Rollback pack | ✅ Authored — `ROLLBACK_PACK_SOFT_RLS.md` |

**Next human action:** Execute Gate A on isolated clone per checklist. Local pass is a dev sanity gate only; Production Soft RLS remains blocked until clone isolation PASS + written approval.

---

**Product:** ALODILA-PMS  
**Document type:** CTO execution roadmap (planning only)  
**Author role:** CTO Roadmap Agent  
**Date:** 2026-08-04  
**Governing challenge:** `SPRINT4_ARCHITECTURE_CHALLENGE.md`  
**Constraints:** No code · No SQL execution · Additive / clone-first · Zero ALODILA data loss  

---

## Verdict

Replace the six-sprint soft corridor (**S4 soft RLS → S5 Auth → S6 debt → S7 beta → S8 billing → S9 harden**) with **four gates**. Auth bind and isolation proof move into the same clone campaign; long soft-NULL / SA-portfolio theater is dropped; billing stays last; hardening runs in parallel with Gates B–C.

**Estimated calendar savings vs current plan: ~30–50% of remaining isolation work (~3–6 weeks wall-clock),** assuming one owner for the clone campaign and no soft-RLS season in production.

---

## 1. Already done (do not re-plan)

| Layer | Status | Evidence |
|-------|--------|----------|
| Platform Principles + shared-DB tenancy model | ✅ | `PLATFORM_ARCHITECTURE_V1.md` |
| Sprint 1–2 — platform control plane | ✅ | Companies CRUD; PMS unchanged |
| Sprint 3 — `company_id` on all in-scope tables + ALODILA backfill | ✅ | Packages 1–5 applied (nullable) |
| Sprint 4 Streams A–D **app** | ✅ | Adapter, insert stamps, read filters, UPDATE company eq |
| Live RLS policy inventory | ✅ | `SPRINT4_RLS_POLICY_INVENTORY.md` |
| Migration **006 V2** (helpers + soft policies) | ✅ **AUTHORED, not applied** | `006_sprint4_soft_rls_v2.sql` |
| Migration **006b** Wave A indexes | ✅ **AUTHORED, not applied** | concurrent apply, outside txn |
| JWT claim model (`app_metadata` only) | ✅ Design approved | `SPRINT4_JWT_CLAIM_MODEL.md` |
| Clone stand-up + prod readiness runbooks | ✅ Docs | `SPRINT4_CLONE_STANDUP.md`, `SPRINT4_PRODUCTION_READINESS.md` |
| Architecture challenge (merge / cut soft corridor) | ✅ | `SPRINT4_ARCHITECTURE_CHALLENGE.md` |

**Still missing (blocks Gate A):** clone project · Auth persona provisioning on clone · 006 V2 apply · isolation QA execution.

---

## 2. Current vs optimized

### Current (legacy sprint numbers)

```
DONE: S1–S3 foundation · S4 app Streams A–D
REMAIN:  S4 soft RLS apply/QA
      →  S5 Auth personas & ALODILA bind
      →  S6 isolation debt (NOT NULL, composites, secondary units…)
      →  S7 multi-company beta + assume-company product
      →  S8 billing / subscription stub
      →  S9 harden & docs
```

**Problem (from challenge):** Soft RLS without company login is incomplete; Auth without hard RLS leaves app-only trust; nullable + SA bypass prolongs a dual soft mode that duplicates work instead of closing leak surface.

### Optimized (four gates)

```
✅ Foundation (S1–S3 + S4 app)
▶ Gate A  Clone + Auth bind + 006 V2 + isolation matrix
▶ Gate B  NOT NULL + harden claims (strict cutover)
▶ Gate C  Company B beta + minimal assume-company
▶ Gate D  Billing stub
∥ Harden / runbooks / doc archive   (parallel B→D)
```

Old Sprint 4–9 labels remain in git history; **execution follows Gates A–D.**

---

## 3. Gate definitions

### Gate A — Hard isolation campaign (clone)

**Merges:** remaining Sprint 4 SQL/QA **∪** Sprint 5 Auth bind (ALODILA + CA/CB/OA/OB).

| Work | In scope |
|------|----------|
| Stand up clone | Per `SPRINT4_CLONE_STANDUP.md`; backup/restore drill |
| Auth bind | Provision company/owner users with **`app_metadata` only** (`SPRINT4_JWT_CLAIM_MODEL.md`); ALODILA **company login** (`role=company`, `company_id=ALODILA`); SA reserved for `/platform` |
| Apply 006 V2 + 006b | **Clone only** — isolation proof vehicle |
| Smoke | ALODILA ops **as company login**, not as SA portfolio |
| Isolation QA | `SPRINT4_ISOLATION_QA.md` two-company matrix |
| Exit | Matrix PASS + written note; **no production soft-RLS destination** |

**Do not call Gate A “isolation complete” if day-to-day ops still run as unscoped SA.**

---

### Gate B — Hard cutover (clone → then prod, same order)

**Merges:** Sprint 6 debt that is **schema/claim hardness**, not cosmetic polish.

| Work | In scope |
|------|----------|
| Zero-NULL proof | `COUNT(*) WHERE company_id IS NULL = 0` on every tenant table |
| `NOT NULL company_id` | After proof; drop soft-NULL policy/app branches |
| Harden claims | Authz reads **`app_metadata` only**; delete `user_metadata` / legacy top-level authz paths; retire silent SA→ALODILA default as ops path |
| Strict RLS posture | Company match for company/owner; SA PMS only via explicit assume (even if assume is a claim/session flag, not a full UI) |
| Exit | Clone PASS under company login + `NOT NULL`; then prod apply in **same order** (Auth bind → NOT NULL → strict policies) |

**Skipped as a long phase:** production soft-RLS season and dual soft-NULL QA matrices.

---

### Gate C — Multi-company beta

**Merges:** Sprint 7 beta **∪** Sprint 6 structural blockers that fail two-tenant QA.

| Work | In scope |
|------|----------|
| Company B | Provision + one login; real second-tenant ops on clone/staging |
| Structural debt that blocks integrity | Secondary-unit cross-company gaps; composite uniques / NID scope; parent-integrity blockers surfaced by Gate A/B QA |
| Assume-company | **Minimal** audited path for SA support (claim/session + log) — enough for break-glass |
| Exit | Beta criteria: two companies isolated; ALODILA unaffected; support path exists without SA full portfolio |

**Deferred out of Gate C:** polished assume-company product UI, multi-seat memberships, occupancy cosmetics that do not affect cross-tenant integrity.

---

### Gate D — Commercial stub

**Equals:** old Sprint 8 (kept separate — challenge explicit non-merge).

| Work | In scope |
|------|----------|
| Plans / grandfathering | Internal plans; ALODILA grandfathered |
| Billing RFC | Architecture only; no forced enforcement |
| Exit | Commercial design approved |

---

## 4. Dropped · parallelized · deferred

### DROPPED (do not schedule)

| Item | Why |
|------|-----|
| Long **production soft RLS** season as destination | Duplicates hard cutover; SA bypass false-safety (`ARCHITECTURE_CHALLENGE`) |
| Soft-NULL “untagged = ALODILA” as steady state | Data already backfilled; adds leak/lockout ambiguity |
| Separate **Sprint 5** after soft RLS | Inverts risk; Auth belongs in Gate A |
| Separate **Sprint 6 philosophy** sprint | Only integrity blockers enter Gate B/C |
| Expanding `companyDb` façade / new soft modes | Thin helpers already shipped; freeze API |
| New Sprint 4 design-variant docs | One apply runbook + one QA matrix thereafter |

### PARALLELIZED (with Gates B–C, finish by Gate D)

| Item | Was | Now |
|------|-----|-----|
| Hardening & docs (old S9) | Serial after billing | Runbooks, RLS regression checklist, archive stale stream novels — **∥ B→D** |
| Doc consolidation | Ongoing thrash | One tenancy runbook + one isolation QA; keep Sprint 3 execution log as audit trail |
| Owner onboarding NID scoping design | Scattered S5+ | Design in parallel with Gate B; implement when Gate C QA demands it |

### DEFERRED (post-beta / post-MVP)

| Item | Until |
|------|-------|
| Full audited assume-company **product UI** | After Gate C minimal path proves need |
| Multi-seat memberships / company switcher | Explicitly post-MVP |
| Billing enforcement / paywalls | After Gate D design approval |
| DB-per-tenant / schema-per-tenant | Not in v1 |

---

## 5. Critical path

```
Clone exists
    → Auth-bound ALODILA company login + CA/CB/OA/OB (app_metadata)
    → 006 V2 + 006b on clone
    → Isolation matrix PASS (company login, not SA)
    → Zero-NULL audit → NOT NULL + claim harden (Gate B)
    → Company B beta + structural blockers + minimal assume (Gate C)
    → Prod cutover in same order as clone
    → Billing stub (Gate D)
```

**Single hard blocker today:** clone does not exist. Everything else for Gate A is authored or app-complete.

**Non-negotiables on the path:**

1. Two-company clone matrix before any prod RLS / `NOT NULL`.
2. Keep app stamps + `.eq('company_id')` (defense in depth after hard gate).
3. Never authorize from `user_metadata`.
4. SA ≠ day-to-day PMS after ALODILA company login exists.
5. Billing does not gate isolation.

---

## 6. What we authored today that pulls work left

Design and SQL authored **2026-08-04** compress calendar by front-loading decisions that used to sit in later sprints:

| Artifact | Pulls left from… | Effect |
|----------|------------------|--------|
| `SPRINT4_ARCHITECTURE_CHALLENGE.md` | Soft corridor planning | Authorizes merge of Auth∪RLS and skip of soft destination |
| `SPRINT4_JWT_CLAIM_MODEL.md` | Sprint 5 claim design | Gate A can provision users against a fixed contract — no design wait |
| `006_sprint4_soft_rls_v2.sql` + `006b_…` | Sprint 4 Stream D apply prep | Apply work is clone-ops, not authoring |
| `SPRINT4_RLS_POLICY_INVENTORY.md` | Policy rewrite thrash | Inventory-driven drops; avoids V1 name collisions |
| `SPRINT4_CLONE_STANDUP.md` | Ad-hoc clone discovery | Stand-up is checklist, not research |
| `SPRINT4_PRODUCTION_READINESS.md` | Sprint 9 runbook start | Prod gate criteria already written |
| App Streams A–D complete | Sprint 4 app calendar | Remaining cost is Auth + SQL + QA + debt, not adapter invent |

**Net:** remaining isolation effort is almost entirely **operator/clone execution + claim cutover + hardness**, not greenfield design.

---

## 7. Calendar savings (order-of-magnitude)

| Cut / merge | Saved | Cost / condition |
|-------------|-------|------------------|
| Skip prod soft-RLS season; clone → harden | ~1–2 weeks | Auth bind in Gate A (required) |
| Collapse S5–S7 into Gates A–C | ~1–3 weeks handoffs / re-approvals | Single campaign owner |
| Drop soft-NULL dual matrices | ~several days | Zero-NULL proof first |
| Defer assume **product** UI | ~days–1 week | Minimal assume in Gate C |
| Stop new Sprint 4 design variants | ~days | Discipline; use this roadmap + challenge |
| **Total vs old remaining isolation corridor** | **~30–50%** | Clone gates stay strict |

Billing (Gate D) calendar is **unchanged** — deliberately not merged into isolation.

---

## 8. Mapping: old sprints → gates

| Old | Fate |
|-----|------|
| S4 remaining (006 + QA) | **Gate A** |
| S5 Auth bind & claim cutover | **Gate A** (bind + dual-read) → **Gate B** (app_metadata-only harden) |
| S6 NOT NULL / claim hardness | **Gate B** |
| S6 structural blockers (secondary units, composites, …) | **Gate C** (only what fails QA) |
| S7 beta + assume | **Gate C** (minimal assume; product UI deferred) |
| S8 billing stub | **Gate D** |
| S9 harden & docs | **∥ Parallel** B→D |

---

## 9. Exit criteria cheat sheet

| Gate | Exit when… |
|------|------------|
| **A** | Clone live; ALODILA company login works; 006 V2 applied on clone; isolation matrix PASS under company/owner personas |
| **B** | Zero NULLs → `NOT NULL`; authz = `app_metadata` only; no silent SA PMS portfolio; clone PASS under strict posture |
| **C** | Company B operable; cross-tenant QA green; structural blockers that failed QA fixed; minimal assume logged |
| **D** | Subscription stub + billing RFC approved; ALODILA grandfathered |

---

## 10. Immediate next action (human ops — not this doc)

1. Create clone per `SPRINT4_CLONE_STANDUP.md`.  
2. Start **Gate A** — do not open a soft-RLS production ticket.  
3. Treat this file + `SPRINT4_ARCHITECTURE_CHALLENGE.md` as the remaining sequence of record.

---

*End of ROADMAP_OPTIMIZED_V2. No code or SQL executed.*
