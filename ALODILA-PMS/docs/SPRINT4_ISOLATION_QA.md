# Sprint 4 — Isolation QA (Two-Company Clone)

**Product:** ALODILA-PMS  
**Document type:** Isolation QA protocol (documentation only — no code)  
**Status:** DRAFT — **clone / staging only** until production gate is approved  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Source plan:** `SPRINT4_QA_ISOLATION_TEST_PLAN.md`  
**Governing docs:** `SPRINT4_RLS_DESIGN.md` · `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_APP_INVENTORY.md`

---

## 0. Purpose & hard rules

### 0.1 Purpose

Prove soft company isolation end-to-end on a two-company clone:

1. Company-scoped sessions see and mutate **only** their own rows.
2. Owner portal stays read-only and portfolio-scoped **plus** company-aligned.
3. Isolation PASS/FAIL is judged by **CA / CB / OA / OB only** — never by Super Admin visibility.
4. ALODILA production-like behavior still works on the clone copy of live data.

**Exit line:** *Two-company clone test shows zero cross-read for company-scoped and owner-scoped sessions.*

### 0.2 Critical rule — no Super Admin bypass for isolation proof

| Rule | Requirement |
|------|-------------|
| Isolation evidence | Cross-tenant leak/mutation verdicts use **CA, CB, OA, OB only** |
| **SA** role | **Prep only** (seed, platform smoke, transitional ops) — **not** isolation evidence |
| Why | Soft RLS still allows `is_super_admin()` to read/write PMS rows. SA seeing both companies is **expected** and does **not** prove isolation |

Do **not** mark isolation PASS based on SA SELECT of both companies, SA writes into another company, or forged client filters without a company/owner session.

### 0.3 Environment

| Environment | Allowed |
|-------------|---------|
| Clone / staging | Full protocol (prep + isolation + regression) |
| Production | **No** Company B seed, **no** isolation proof until clone PASS + explicit approval |

---

## 1. Personas

All isolation actors use **trusted claims** (`app_metadata` preferred). Do not rely on editable `user_metadata` for authorization.

### 1.1 Isolation proof (mandatory)

| ID | Persona | Auth claims (target) | Purpose |
|----|---------|----------------------|---------|
| **CA** | Company A operator | `role = company`, `company_id = ALODILA UUID` | ALODILA company login sees only Company A |
| **CB** | Company B operator | `role = company`, `company_id = Company B UUID` | Primary isolation actor — must never see/mutate ALODILA |
| **OA** | Owner A (ALODILA) | `role = owner`, `owner_crm_id = <ALODILA owner>` | Owner regression + no write; no Company B |
| **OB** | Owner B (Company B) | `role = owner`, `owner_crm_id = <Company B owner>` | Own portfolio inside Company B only |

### 1.2 Prep only (not isolation evidence)

| ID | Persona | Allowed use |
|----|---------|-------------|
| **SA** | Platform Super Admin | Seed Company B, Platform Admin smoke, verify `companies` ACL, ALODILA transitional ops smoke |

After each login, confirm JWT claims before running cases. Never “quick check” isolation while signed in as SA.

---

## 2. Two-company clone protocol

Execute prep as **SA** (or service role / SQL on clone). Record all UUIDs in the run log.

### 2.1 Clone baseline

| Step | Action | Pass |
|------|--------|------|
| P1 | Restore production backup to isolated clone / branch | Clone reachable; no prod writes |
| P2 | Confirm Packages 1–5: `company_id` on in-scope tables, ALODILA backfill, FKs present | Spot-check counts; prefer 0 NULL residuals |
| P3 | Soft RLS helpers + policies applied on clone | Helpers exist; policies additive |
| P4 | App company filters/stamps deployed to clone build | Build points at clone |

### 2.2 Seed Company B registry

| Step | Action | Pass |
|------|--------|------|
| P5 | Insert **Company B** in `companies` with a **new UUID** (never reuse ALODILA) | Row exists; record `COMPANY_B_ID` |
| P6 | Do not mutate ALODILA registry identity | ALODILA UUID unchanged |

### 2.3 Synthetic Company B dataset (minimal)

All rows tagged `company_id = COMPANY_B_ID`. Additive inserts only — **no** ALODILA re-parent.

| Entity | Minimum | Distinct markers |
|--------|---------|------------------|
| Owner | 1 | Prefix `ISO-B-OWNER` |
| Tenant | 1 | Prefix `ISO-B-TENANT` |
| Property | 1 | Prefix `ISO-B-PROP` |
| Unit | ≥1 | Unique vs ALODILA |
| Contract | 1 | Linked to B unit + B tenant |
| Invoice | ≥1 | Linked to B contract |
| Payment | ≥1 (preferred) | Linked to B invoice |
| Maintenance | ≥1 (preferred) | Linked to B unit/property |

Record: `OWNER_B_CRM_ID`, `PROPERTY_B_ID`, `UNIT_B_ID`, `CONTRACT_B_ID`, `INVOICE_B_ID`, plus known ALODILA counterparts (`PROPERTY_A_ID`, etc.) for negative tests.

### 2.4 Auth users on clone

| User | Claims | Notes |
|------|--------|-------|
| CA | `role=company`, `company_id=ALODILA` | Dedicated company login — not SA |
| CB | `role=company`, `company_id=COMPANY_B_ID` | Isolation primary |
| OA | `role=owner`, `owner_crm_id=<ALODILA owner>` | Existing portal path |
| OB | `role=owner`, `owner_crm_id=OWNER_B_CRM_ID` | Optional `company_id=COMPANY_B_ID` |
| SA | `role=super_admin` | **Prep / platform only** |

### 2.5 Pre-flight gate (before TC execution)

| # | Check | ☐ |
|---|-------|---|
| PF1 | Company B synthetic graph complete and tagged | |
| PF2 | CA / CB / OA / OB can sign in | |
| PF3 | CB JWT `company_id` = `COMPANY_B_ID` (not ALODILA) | |
| PF4 | CA JWT is company-scoped (not SA) | |
| PF5 | Known ALODILA and Company B ids recorded | |
| PF6 | Tester acknowledges: **SA results are not isolation evidence** | |

### 2.6 Order of battle

```
Prep (P1–P6, PF1–PF6)
    ↓
Isolation reads: CB → CA → Owners (OA/OB)
    ↓
Isolation writes: CB → CA
    ↓
Hotspots (import / occupancy / ledger / RPC / AI)
    ↓
Platform ACL + negatives
    ↓
ALODILA regression
    ↓
Score exit matrix (§5)
```

**Session hygiene:** one browser profile / incognito per persona (or hard sign-out between). Capture evidence for blocker-capable cases: persona, claim snapshot, action, result count/error, timestamp.

### 2.7 In-scope surfaces (summary)

**PMS tables:** `owners`, `tenants`, `properties`, `units`, `meters` (DB-only if policies exist), `contracts`, `invoices`, `payments`, `maintenance_requests`.

**Control plane:** `companies` / Platform Admin — SA only; CA/CB/OA/OB denied.

**Layers:** app adapter (lists/aggregates/exports), RLS (even if app filter omitted), combined UI + DB proof.

**Hotspots that must be in the matrix:** Smart Import global name match; `refreshUnitOccupancyFromContracts`; ledger/dashboard/AI rollups; `ownerLookupForOnboarding` RPC.

---

## 3. Expected outputs

### 3.1 Global PASS rules

A case PASSes only if **all** apply:

1. Actor is **CA, CB, OA, or OB** (never SA for cross-tenant verdict).
2. Observed rows / mutations match **only** the actor’s company (and owner portfolio for OA/OB).
3. Cross-tenant SELECT returns **empty / not found / denied** (0 visible foreign rows).
4. Cross-tenant INSERT/UPDATE/soft-delete is **denied** or affects **0 rows**, with no silent success.
5. Aggregates, exports, AI context, and reports exclude foreign company data.

### 3.2 Soft-mode observations (record — do not confuse with PASS)

| Observation | Interpretation |
|-------------|----------------|
| SA sees both A and B | Expected under soft RLS — **not** a FAIL, **not** a PASS |
| Legacy staff defaults to ALODILA only | Transition OK — **not** cross-tenant proof |
| NULL `company_id` rows on ALODILA path | Soft rule; CB must still **deny** on NULL rows |

### 3.3 Expected by persona (proof matrix)

| Actor | Read | Write | Platform `companies` |
|-------|------|-------|----------------------|
| **CB** | Only `COMPANY_B_ID` / `ISO-B-*` | Own company only; cross-tenant denied | Denied |
| **CA** | ALODILA only; no `ISO-B-*` | Stamp ALODILA; cannot touch B | Denied |
| **OB** | Own portfolio inside Company B | Read-only (staff writes denied) | Denied |
| **OA** | ALODILA owner graph; no Company B | Read-only | Denied |
| **SA** | May see both (info only) | Prep / transitional — not isolation evidence | Allowed |

### 3.4 Core expected case outcomes

| Area | Expected output |
|------|-----------------|
| CB lists (properties, CRM, finance, maintenance) | Only Company B rows |
| CB open ALODILA id by URL / API count | Not found / **0** rows |
| CA lists | ALODILA portfolio; no Company B markers |
| CA open Company B id / API count | Not found / **0** rows |
| CB INSERT with `company_id = ALODILA` or null | Denied |
| CB UPDATE / soft-delete ALODILA row | 0 rows / error; ALODILA unchanged |
| CB re-tenant own row → ALODILA | Denied; company unchanged |
| CA INSERT | `company_id = ALODILA`; CA cannot UPDATE B |
| OB / OA cross-company property | Denied / empty |
| Owner staff write APIs | Denied (read-only preserved) |
| Hotspots (import, occupancy, ledger, RPC, AI) | No cross-company match/mutate/aggregate mix |
| CA/CB/OA/OB `/platform` | Denied / redirect |
| SA platform companies list | Sees ALODILA + Company B registry (info) |

### 3.5 Clone exit matrix (company/owner sessions only)

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | CB | SELECT properties / contracts / invoices | Only Company B |
| 2 | CB | SELECT COUNT ALODILA-tagged rows | Zero visible |
| 3 | CA | SELECT ALODILA portfolio | Present |
| 4 | CA | SELECT Company B rows | Zero |
| 5 | CB | INSERT `company_id = ALODILA` | Denied |
| 6 | CB | UPDATE ALODILA row | Denied / 0 rows |
| 7 | OB | SELECT | Own portfolio inside Company B |
| 8 | OB | SELECT ALODILA owner portfolio | Denied |
| 9 | CA/CB/OA/OB | SELECT/INSERT `companies` | Denied |
| 10 | OA | ALODILA owner portal regression | Works |

**Clone exit PASS** when: all 10 rows PASS; hotspot cases PASS (default required); no Blocker open; no isolation verdict relied on SA.

---

## 4. Failure cases

### 4.1 Isolation FAIL (any one)

- Any Company B session (**CB** / **OB**) sees an ALODILA-tagged row (UI or API).
- Any Company A session (**CA** / **OA**) sees a Company B–tagged row.
- Owner B sees Owner A portfolio (or any ALODILA property graph).
- Owner A sees Company B synthetic rows.
- Cross-tenant write succeeds or re-tenants `company_id`.
- Unscoped aggregate (dashboard / reports / AI / import match) mixes companies for CA/CB.
- CA/CB can read or write `companies` registry.
- Test was “passed” using **SA** visibility as proof.

### 4.2 Severity

| Severity | Examples | Exit impact |
|----------|----------|-------------|
| **Blocker** | Cross-read or cross-write for CA/CB/OA/OB | Clone matrix FAIL — no production soft RLS |
| **Major** | Aggregate / AI / import leak while lists are clean | FAIL until fixed |
| **Minor** | UX copy, empty states, non-leak flakiness | Fix before prod gate preferred |
| **Info** | SA dual visibility | Record only — not FAIL |

### 4.3 Abuse / negative expectations (FAIL if violated)

| Case | Expected (PASS) | FAIL if… |
|------|-----------------|----------|
| CB strips/overrides client `company_id` filter | RLS still returns 0 ALODILA rows | Foreign rows returned |
| CB guesses ALODILA UUIDs in detail URLs | No data leak | Any ALODILA payload shown |
| Unauthenticated PMS access | Denied | Any row returned |
| Owner on staff routes | Redirect; writes denied | Staff write succeeds |

### 4.4 On FAIL

1. Do **not** enable production soft company predicates.
2. Fix soft policies / adapter / hotspots.
3. Re-run from the affected section (or full matrix if Blocker).
4. Apply rollback criteria in §5 if clone is unsafe to continue.

---

## 5. Rollback criteria

### 5.1 When to roll back (clone)

| If… | Then… |
|-----|-------|
| Isolation FAIL after policy apply (Blocker or unresolved Major) | Revert soft policy migration on clone; keep helpers if inert |
| Synthetic Company B data pollutes debugging | Drop **Company B synthetic rows only** on clone |
| Need clean re-run | Re-seed B from §2.3; do **not** touch ALODILA production data |
| Accidental production targeting | **Stop immediately** — this protocol is clone-only until §6 |

### 5.2 Rollback safety rules

- Never use clone destructive experiments as a template for production deletes of ALODILA data.
- Never re-parent live ALODILA rows to Company B (or vice versa) as part of “cleanup.”
- SA dual visibility alone is **not** a rollback trigger (expected under soft RLS).
- Rollback is complete when: soft company predicates no longer enforce on clone (or policies reverted), Company B seed is either removed or clearly labeled for re-seed, and ALODILA clone baseline remains intact for regression.

### 5.3 After rollback

| Step | Action |
|------|--------|
| 1 | Document FAIL case ids, persona, evidence |
| 2 | Fix root cause (policy / adapter / hotspot) |
| 3 | Re-apply policies on clone if needed |
| 4 | Re-seed Company B if dropped |
| 5 | Re-run pre-flight + exit matrix with CA/CB/OA/OB only |

---

## 6. Production gate (after clone PASS)

Do **not** apply production soft RLS until:

| Gate | Owner | ☐ |
|------|-------|---|
| Clone exit matrix PASS | QA + eng | |
| ALODILA CA + OA smoke on clone | QA | |
| Hotspot leak matrix PASS | Eng | |
| Explicit written approval for production migration | Product / eng lead | |
| Rollback plan documented (revert additive policies) | Eng | |

Production isolation re-proof with a second real customer is a later milestone.

---

## 7. Run log template

```
Sprint 4 Isolation QA Run
Date:
Clone project / branch:
Build / commit:
COMPANY_B_ID:
Tester:

Pre-flight: PF1__ PF2__ PF3__ PF4__ PF5__ PF6__

Exit matrix 1–10: (attach §3.5 results)

Blockers open:
Major open:
SA dual-visibility noted (info): Y/N

Clone exit: PASS / FAIL
Rollback applied: Y/N (reason:)
Sign-off:
```

---

## 8. Traceability

| This doc | Source |
|----------|--------|
| Full case catalog (ISO-*, REG-*, PLT-*, NEG-*) | `SPRINT4_QA_ISOLATION_TEST_PLAN.md` §§5–7 |
| Personas CA/CB/OA/OB/SA | `SPRINT4_RLS_DESIGN.md` §7–9; `SPRINT4_SHARED_ADAPTER.md` §0.3 |
| Two-company prep + exit line | `SPRINT4_RLS_DESIGN.md` §10 |
| Module / hotspot coverage | `SPRINT4_APP_INVENTORY.md` |

---

## Document control

| Field | Value |
|-------|--------|
| Deliverable | `docs/SPRINT4_ISOLATION_QA.md` only |
| Code / SQL | None |
| Isolation proof actors | **CA, CB, OA, OB only** |
| Super Admin (**SA**) | Prep / platform / info — **not** isolation evidence |
| ALODILA UUID | `a1000000-a10d-4000-8000-000000000001` |

---

*End of Sprint 4 Isolation QA*
