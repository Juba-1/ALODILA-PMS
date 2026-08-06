# Sprint 4 — QA & Two-Company Isolation Test Plan

**Product:** ALODILA-PMS  
**Document type:** QA / isolation proof plan (documentation only)  
**Status:** DRAFT — execute on **clone/staging only** until production gate is approved  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Governing docs:** `SPRINT4_RLS_DESIGN.md` · `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_APP_INVENTORY.md` · `SPRINT3_TENANCY_EXECUTION.md`  
**Prerequisite:** Sprint 3 Packages 1–5 closed (`company_id` present + backfilled on in-scope tables; still nullable); soft RLS helpers/policies + app company filters landed on clone

---

## 0. Purpose & hard rules

### 0.1 Purpose

Prove that Sprint 4 soft company isolation works end-to-end:

1. Company-scoped sessions see and mutate **only** their own rows.
2. Owner portal stays read-only and portfolio-scoped **plus** company-aligned.
3. Platform Super Admin control-plane (`companies`) stays Super Admin–only.
4. ALODILA production-like behavior still works on the clone copy of live data.
5. Isolation is proven by **company / owner sessions**, not by platform privilege.

### 0.2 Critical isolation proof rule

| Rule | Requirement |
|------|-------------|
| **No Super Admin bypass for isolation proof** | Isolation PASS/FAIL for cross-tenant leak/mutation **must** be judged using **Company A**, **Company B**, and **Owner** sessions only. |
| Super Admin role in this plan | Allowed for **prep**, **smoke**, **control-plane**, and **transition regression** — **not** as evidence that tenants are isolated. |
| Why | Soft RLS still allows `is_super_admin()` to read/write PMS rows during transition. A Super Admin session that “sees both companies” is **expected** and **does not** prove isolation. |

**Exit line (architecture):** *Two-company clone test shows zero cross-read for company-scoped and owner-scoped sessions.*

### 0.3 Environment posture

| Environment | Allowed |
|-------------|---------|
| Clone / staging | Full matrix (prep + isolation + regression) |
| Production | **No** Company B seed, **no** policy experiments, **no** isolation proof until clone matrix PASSes and explicit approval |

### 0.4 Non-goals (this plan)

- Hard RLS / `NOT NULL` cutover
- Removing `is_super_admin()` PMS bypass
- Auth persona productization (Sprint 5)
- Assume-company UX (Sprint 7)
- Contaminant table cleanup
- Production data delete / re-parent

---

## 1. Personas

All isolation actors use **trusted claims** (`app_metadata` preferred). Do not rely on editable `user_metadata` for authorization decisions.

### 1.1 Isolation proof personas (mandatory)

| ID | Persona | Auth claims (target) | Purpose |
|----|---------|----------------------|---------|
| **CA** | Company A operator | `role = company`, `company_id = ALODILA UUID` | Prove ALODILA company login sees only Company A |
| **CB** | Company B operator | `role = company`, `company_id = Company B UUID` | Primary isolation actor — must never see/mutate ALODILA |
| **OA** | Owner A (ALODILA) | `role = owner`, `owner_crm_id = <ALODILA owner>`, optional `company_id = ALODILA` | Owner regression + no write |
| **OB** | Owner B (Company B) | `role = owner`, `owner_crm_id = <Company B owner>`, optional `company_id = Company B` | Owner isolation — only own portfolio inside Company B |

### 1.2 Support personas (non-isolation evidence)

| ID | Persona | Claims | Allowed use in this plan |
|----|---------|--------|--------------------------|
| **SA** | Platform Super Admin | `role = super_admin` (current claim path) | Seed Company B, Platform Admin smoke, verify `companies` ACL, ALODILA transitional ops smoke |
| **ST** | Legacy staff (optional) | Authenticated ops without company claim (defaults to ALODILA) | Transition regression only; **do not** use for cross-tenant PASS |

### 1.3 Persona exclusions for isolation verdicts

Do **not** mark an isolation test case PASS based on:

- SA SELECT that returns both companies (expected under soft RLS).
- SA INSERT/UPDATE into another company (break-glass transitional path — out of isolation proof).
- Forged client `company_id` query params alone without a company/owner session.

---

## 2. In-scope surfaces

### 2.1 Tables (PMS data plane)

| Table | Package | Isolation checks |
|-------|---------|------------------|
| `owners` | 1 | SELECT / INSERT / UPDATE / soft-delete |
| `tenants` | 1 | SELECT / INSERT / UPDATE / soft-delete |
| `properties` | 2 | SELECT / INSERT / UPDATE / soft-delete |
| `units` | 3 | SELECT / INSERT / UPDATE / soft-delete |
| `meters` | 3 | DB-level only if policies exist (app unused; 0 live rows expected) |
| `contracts` | 4 | SELECT / INSERT / UPDATE / soft-delete / terminate |
| `invoices` | 5 | SELECT / INSERT / UPDATE / soft-delete |
| `payments` | 5 | SELECT / INSERT / UPDATE / soft-delete |
| `maintenance_requests` | 5 | SELECT / INSERT / UPDATE / soft-delete |

### 2.2 Control plane

| Table / UI | Actor | Expectation |
|------------|-------|-------------|
| `companies` / Platform Admin | SA only | CA / CB / OA / OB denied |
| PMS portfolio via Platform | SA | Not used as isolation proof |

### 2.3 App modules (defense in depth)

Per `SPRINT4_APP_INVENTORY.md` — company filters/stamps on:

- CRM: `owners.js`, `tenants.js`, `tenantStatement.js`
- Portfolio: `properties.js`, `units.js`
- Contracts: `contracts.js`, `contractFinance.js`
- Finance: `invoices.js`, `payments.js`, `ledgerTotals.js`
- Ops: `maintenance.js`, `dashboard.js`, `reports.js`
- Owner: `ownerPortal.js`
- Import / AI: `smartImport.js`, `chatContext.js` (via scoped loaders)

Rewrite-risk hotspots (must be in isolation + leak matrix):

1. Smart Import global name match  
2. `refreshUnitOccupancyFromContracts` full scan  
3. `ledgerTotals` / dashboard / AI rollups  
4. `ownerLookupForOnboarding` RPC  

### 2.4 Layers under test

| Layer | What to prove |
|-------|----------------|
| **App adapter** | Lists/details/aggregates/exports only return in-scope company rows for CA/CB/OA/OB |
| **RLS** | Even if app filter omitted or client forges filters, company/owner sessions cannot read/write foreign rows |
| **Combined** | UI smoke matches DB proof |

---

## 3. Preparation (clone only)

Execute as **SA** (or service role / SQL on clone). Record UUIDs in the run log.

### 3.1 Clone baseline

| Step | Action | Pass |
|------|--------|------|
| P1 | Restore production backup to isolated clone / branch | Clone reachable; no prod writes |
| P2 | Confirm Packages 1–5 state: `company_id` on all in-scope tables, ALODILA backfill, FKs present, nullable | Spot-check counts; NULL residual = 0 preferred |
| P3 | Soft RLS helpers + policies applied on clone | Helpers exist; policies additive |
| P4 | App company filters/stamps deployed to clone build | Build points at clone |

### 3.2 Seed Company B registry

| Step | Action | Pass |
|------|--------|------|
| P5 | Insert **Company B** row in `companies` with a **new UUID** (never reuse ALODILA) | Row exists; UUID recorded as `COMPANY_B_ID` |
| P6 | Do not mutate existing ALODILA registry identity | ALODILA UUID unchanged |

### 3.3 Synthetic Company B dataset (minimal)

All rows tagged `company_id = COMPANY_B_ID`. Additive inserts only — no ALODILA row re-parent.

| Entity | Minimum | Distinct markers (recommended) |
|--------|---------|--------------------------------|
| Owner | 1 | Name prefix `ISO-B-OWNER` |
| Tenant | 1 | Name prefix `ISO-B-TENANT` |
| Property | 1 | Name prefix `ISO-B-PROP` |
| Unit | ≥1 | Code/label unique vs ALODILA |
| Contract | 1 | Linked to B unit + B tenant |
| Invoice | ≥1 | Linked to B contract |
| Payment | ≥1 (optional but preferred) | Linked to B invoice |
| Maintenance | ≥1 (optional but preferred) | Linked to B unit/property |

Record: `OWNER_B_CRM_ID`, `PROPERTY_B_ID`, `UNIT_B_ID`, `CONTRACT_B_ID`, `INVOICE_B_ID`, and at least one known ALODILA counterpart id for negative tests (`PROPERTY_A_ID`, etc.).

### 3.4 Auth users on clone

| User | Claims | Notes |
|------|--------|-------|
| CA | `role=company`, `company_id=ALODILA` | Prefer dedicated company login; do not use SA for CA proofs |
| CB | `role=company`, `company_id=COMPANY_B_ID` | Isolation primary |
| OA | `role=owner`, `owner_crm_id=<ALODILA owner>` | Existing portal path |
| OB | `role=owner`, `owner_crm_id=OWNER_B_CRM_ID` | Optional `company_id=COMPANY_B_ID` |
| SA | `role=super_admin` | Prep / platform only |

After each login, confirm JWT claims (session inspector / `getUser`) before running cases.

### 3.5 Pre-flight checklist (gate before TC execution)

| # | Check | Pass/Fail |
|---|-------|-----------|
| PF1 | Company B synthetic graph complete and tagged | |
| PF2 | CA/CB/OA/OB can sign in | |
| PF3 | CB JWT `company_id` = `COMPANY_B_ID` (not ALODILA) | |
| PF4 | CA JWT is company-scoped (not SA) | |
| PF5 | Known ALODILA row ids and Company B ids recorded | |
| PF6 | Tester acknowledges: **SA results are not isolation evidence** | |

---

## 4. Pass / fail criteria (global)

### 4.1 Isolation PASS (required for exit)

A case PASSes only if **all** apply:

1. Actor is **CA, CB, OA, or OB** (never SA for cross-tenant verdict).
2. Observed rows / mutations match **only** the actor’s company (and owner portfolio for OA/OB).
3. Cross-tenant SELECT returns **empty / not found / denied** (0 visible foreign rows).
4. Cross-tenant INSERT/UPDATE/soft-delete is **denied** or affects **0 rows**, with no silent success.
5. Aggregates, exports, AI context, and reports for that session exclude foreign company data.

### 4.2 Isolation FAIL (any one)

- Any Company B session sees an ALODILA-tagged row (UI or API).
- Any Company A session sees a Company B–tagged row.
- Owner B sees Owner A portfolio (or any ALODILA property graph).
- Owner A sees Company B synthetic rows.
- Cross-tenant write succeeds or re-tenants `company_id`.
- Unscoped aggregate (dashboard/reports/AI/import match) mixes companies for CA/CB.
- CA/CB can read or write `companies` registry.
- Test was “passed” using SA visibility as proof.

### 4.3 Soft-mode notes (document, do not confuse with PASS)

| Observation | Interpretation |
|-------------|----------------|
| SA sees both A and B | Expected under soft RLS — **not** a FAIL |
| Legacy ST defaults to ALODILA and sees ALODILA only | Transition OK — **not** cross-tenant proof |
| NULL `company_id` rows visible to ALODILA paths | Soft rule; Company B must still get **deny** on NULL rows |

### 4.4 Severity

| Severity | Examples | Exit impact |
|----------|----------|-------------|
| **Blocker** | Cross-read or cross-write for CA/CB/OA/OB | Clone matrix FAIL — no production soft RLS |
| **Major** | Aggregate/AI/import leak while lists are clean | FAIL until fixed (rewrite hotspots) |
| **Minor** | UX copy, empty states, non-leak flakiness | Fix before prod gate preferred; not isolation exit alone |
| **Info** | SA dual visibility | Record only |

---

## 5. Test case catalog

**IDs:** `ISO-*` = isolation proof · `REG-*` = regression · `PLT-*` = platform · `NEG-*` = negative / abuse  
**Verdict column:** fill Pass / Fail / Blocked / N/A during run.

---

### 5.1 Company B read isolation (`CB`)

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| ISO-CB-01 | CB: list properties | Only `ISO-B-*` / `COMPANY_B_ID` properties | |
| ISO-CB-02 | CB: open `PROPERTY_A_ID` by URL/id | Not found / empty / error — **no ALODILA data** | |
| ISO-CB-03 | CB: list owners, tenants, units, contracts, invoices, payments, maintenance | Only Company B rows | |
| ISO-CB-04 | CB: PostgREST/API SELECT count on ALODILA-tagged properties (or known A ids) | **0** rows | |
| ISO-CB-05 | CB: dashboard KPIs / recent activity / alerts | Counts and lists exclude ALODILA | |
| ISO-CB-06 | CB: reports center (payments, maintenance, active leases) | Company B only | |
| ISO-CB-07 | CB: AI / chat context ledger (if enabled) | No ALODILA entities/names/ids | |
| ISO-CB-08 | CB: export/CSV/PDF from list pages (if used) | Exported set ⊆ Company B | |

### 5.2 Company A read isolation (`CA`)

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| ISO-CA-01 | CA: list properties | ALODILA portfolio; **no** `ISO-B-*` | |
| ISO-CA-02 | CA: open `PROPERTY_B_ID` by URL/id | Not found / denied | |
| ISO-CA-03 | CA: contracts / invoices / payments / maintenance lists | No Company B markers | |
| ISO-CA-04 | CA: dashboard + reports + AI context | No Company B leakage | |
| ISO-CA-05 | CA: SELECT count on Company B–tagged rows via API | **0** rows | |

### 5.3 Cross-tenant write denial (`CB` vs ALODILA)

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| ISO-CB-W01 | CB: INSERT property/tenant/owner with `company_id = ALODILA` | Denied / check failure | |
| ISO-CB-W02 | CB: INSERT with `company_id = null` | Denied for non-ALODILA session | |
| ISO-CB-W03 | CB: UPDATE ALODILA property (known id) | 0 rows / error; ALODILA row unchanged | |
| ISO-CB-W04 | CB: soft-delete ALODILA tenant/contract/invoice | 0 rows / error | |
| ISO-CB-W05 | CB: create payment against ALODILA invoice id | Denied | |
| ISO-CB-W06 | CB: attach B contract to ALODILA unit (or vice versa) | Denied / parent not in scope | |
| ISO-CB-W07 | CB: UPDATE own row attempting to set `company_id` → ALODILA | Denied; company unchanged | |

### 5.4 Company A write confinement (`CA`)

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| ISO-CA-W01 | CA: INSERT new row (stamp) | `company_id = ALODILA` | |
| ISO-CA-W02 | CA: UPDATE Company B row by id | 0 rows / error | |
| ISO-CA-W03 | CA: INSERT with `company_id = COMPANY_B_ID` | Denied | |

### 5.5 Owner portal isolation

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| ISO-OB-01 | OB: owner dashboard / properties | Only Owner B / Company B portfolio | |
| ISO-OB-02 | OB: attempt ALODILA property id | Denied / empty | |
| ISO-OB-03 | OB: reports / maintenance / financial widgets | Company B + own graph only | |
| ISO-OA-01 | OA: portal smoke on clone ALODILA owner | Works as today; no Company B rows | |
| ISO-OA-02 | OA: open Company B property id | Denied | |
| ISO-OWN-W01 | OA or OB: attempt staff write APIs (create invoice, update contract) | Denied (read-only preserved) | |

### 5.6 Soft NULL semantics

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| ISO-NULL-01 | If any NULL `company_id` residual exists: CB SELECT | **Deny** — CB must not claim NULL rows | |
| ISO-NULL-02 | CA / ALODILA-default path on NULL residual (if any) | Document soft behavior; prefer 0 NULLs post Package 5 | |

### 5.7 Control plane & routing

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| PLT-01 | CA/CB: open `/platform` or list `companies` | Denied / redirect; no registry rows | |
| PLT-02 | OA/OB: platform routes | Denied | |
| PLT-03 | SA: Platform companies list/detail | Works; sees ALODILA + Company B registry | |
| PLT-04 | SA: PMS dual visibility | **Info only** — record “SA sees both”; do not score as isolation PASS | |

### 5.8 Rewrite hotspot / aggregate leak matrix

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| ISO-HOT-01 | CB: Smart Import match against ALODILA property/tenant names | Must **not** match or mutate ALODILA entities | |
| ISO-HOT-02 | CB: create/update contract → occupancy refresh | Must not alter ALODILA unit statuses | |
| ISO-HOT-03 | CB vs CA: ledger totals / dashboard month sums | Independent; CB totals ≠ A+B | |
| ISO-HOT-04 | CB: `ownerLookupForOnboarding` with ALODILA owner NID (if RPC reachable) | No ALODILA owner returned (or company-denied) | |
| ISO-HOT-05 | CA: same hotspots must not pull Company B | No B markers in results | |

### 5.9 ALODILA regression (clone)

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| REG-01 | CA: staff console lists (owners, tenants, properties, units, contracts, invoices, maintenance) | Usable; ALODILA data present | |
| REG-02 | CA: create → edit → soft-delete happy path on disposable ALODILA test row | Works; stamped ALODILA | |
| REG-03 | OA: owner portal dashboard / properties / reports / maintenance | Regression PASS | |
| REG-04 | SA: Platform Admin companies CRUD smoke (non-destructive) | Works | |
| REG-05 | Optional ST legacy login | Defaults to ALODILA ops; no Company B | |

### 5.10 Negative / abuse

| ID | Steps | Expected | Verdict |
|----|-------|----------|---------|
| NEG-01 | CB: strip/override `company_id` filter in client request | RLS still returns 0 ALODILA rows | |
| NEG-02 | CB: guess ALODILA UUIDs in detail URLs | No data leak | |
| NEG-03 | Unauthenticated request to PMS tables | Denied | |
| NEG-04 | Owner session on `/` staff routes | App redirect; writes denied | |

---

## 6. Execution procedure

### 6.1 Order of battle

```
Prep (P1–P6, PF1–PF6)
    ↓
Isolation reads CB → CA → Owners
    ↓
Isolation writes CB → CA
    ↓
Hotspots (import / occupancy / ledger / RPC / AI)
    ↓
Platform ACL (PLT) + negatives (NEG)
    ↓
ALODILA regression (REG)
    ↓
Score exit matrix (§7)
```

### 6.2 Session hygiene

1. One browser profile / incognito **per persona** (or hard sign-out between).
2. After login, verify claims before first query.
3. Never “quick check” isolation while signed in as SA.
4. Capture evidence: screenshots or query result counts for each ISO-* case.

### 6.3 Evidence requirements (blocker cases)

For each Blocker-capable case, store:

- Persona id (CA/CB/OA/OB)
- Claim snapshot (`role`, `company_id`, `owner_crm_id`)
- Action + table/module
- Result count / error
- Timestamp

---

## 7. Exit matrix (clone gate)

Map to `SPRINT4_RLS_DESIGN.md` §10.3 — **company/owner sessions only**.

| # | Actor | Action | Expected | Linked cases | Result |
|---|-------|--------|----------|--------------|--------|
| 1 | CB | SELECT properties / contracts / invoices | Only Company B | ISO-CB-01,03 | |
| 2 | CB | SELECT COUNT ALODILA-tagged rows | Zero visible | ISO-CB-04 | |
| 3 | CA | SELECT ALODILA portfolio | Present; unchanged vs baseline intent | ISO-CA-01, REG-01 | |
| 4 | CA | SELECT Company B rows | Zero | ISO-CA-02,05 | |
| 5 | CB | INSERT `company_id = ALODILA` | Denied | ISO-CB-W01 | |
| 6 | CB | UPDATE ALODILA row | Denied / 0 rows | ISO-CB-W03 | |
| 7 | OB | SELECT | Own portfolio inside Company B | ISO-OB-01,03 | |
| 8 | OB | SELECT ALODILA owner portfolio | Denied | ISO-OB-02 | |
| 9 | CA/CB/OA/OB | SELECT/INSERT `companies` | Denied | PLT-01,02 | |
| 10 | OA | ALODILA owner portal regression | Works | ISO-OA-01, REG-03 | |

**Clone exit PASS** when:

1. All 10 exit rows PASS.  
2. Hotspot cases ISO-HOT-01…05 PASS (or explicitly waived with written risk — default = required).  
3. No Blocker open.  
4. No isolation verdict relied on SA.

**Clone exit FAIL** otherwise → fix soft policies / adapter / hotspots; re-run from affected section. Do not enable production soft company predicates.

---

## 8. Production gate (after clone PASS)

Do **not** apply production soft RLS until:

| Gate | Owner | Done |
|------|-------|------|
| Clone exit matrix PASS | QA + eng | |
| ALODILA CA + OA smoke on clone | QA | |
| Hotspot leak matrix PASS | Eng | |
| Explicit written approval for production migration | Product / eng lead | |
| Rollback plan documented (revert additive policies) | Eng | |

Production isolation re-proof with a second real customer is a later milestone; Sprint 4 production enablement only follows clone PASS + approval.

---

## 9. Rollback & safety (clone)

| If… | Then… |
|-----|-------|
| Isolation FAIL after policy apply | Revert soft policy migration on clone; keep helpers if inert |
| Synthetic data pollutes debugging | Drop **Company B synthetic rows only** on clone |
| Need clean re-run | Re-seed B from §3; do not touch ALODILA production |
| Accidental prod targeting | **Stop** — this plan is clone-only until §8 |

Never use clone destructive experiments as a template for production deletes of ALODILA data.

---

## 10. Run log template

```
Sprint 4 Isolation Run
Date:
Clone project / branch:
Build / commit:
COMPANY_B_ID:
Tester:

Pre-flight: PF1__ PF2__ PF3__ PF4__ PF5__ PF6__

Exit matrix 1–10: (attach §7 results)

Blockers open:
Major open:
SA dual-visibility noted (info): Y/N

Clone exit: PASS / FAIL
Sign-off:
```

---

## 11. Traceability

| This plan | Source |
|-----------|--------|
| Personas CA/CB/OA/OB/SA | `SPRINT4_RLS_DESIGN.md` §7–9; `SPRINT4_SHARED_ADAPTER.md` §0.3 |
| Soft NULL / write checks | RLS design §3.3, §5–6 |
| Two-company prep + exit line | RLS design §10 |
| Module / hotspot coverage | `SPRINT4_APP_INVENTORY.md` |
| App filter defense in depth | `SPRINT4_SHARED_ADAPTER.md` §6.5 |
| Column prerequisites | `SPRINT3_TENANCY_EXECUTION.md` Packages 1–5 |

---

## Document control

| Field | Value |
|-------|--------|
| Author role | AGENT F — Sprint 4 QA / Isolation Test Plan |
| Deliverable | `docs/SPRINT4_QA_ISOLATION_TEST_PLAN.md` only |
| Code / SQL | None |
| Isolation proof actors | Company A, Company B, Owner A, Owner B **only** |
| Super Admin | Prep, platform ACL, regression info — **not** isolation evidence |
| ALODILA UUID | `a1000000-a10d-4000-8000-000000000001` |

---

*End of Sprint 4 QA & Two-Company Isolation Test Plan*
