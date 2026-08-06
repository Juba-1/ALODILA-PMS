# Sprint 4 — App Read Filters Migration Plan

**Product:** ALODILA-PMS  
**Document type:** Implementation migration plan (design / sequencing only)  
**Status:** DRAFT — no application code in this workstream  
**Scope:** Wire `resolveReadScope()` + `withCompanyEq()` into PMS **read** loaders under `src/lib/db/*`  
**Governing docs:** `SPRINT4_APP_INVENTORY.md` · `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_RLS_DESIGN.md`  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`

---

## 0. Purpose

Sprint 3 added and backfilled `company_id` on all PMS portfolio tables. The app still loads lists and details with **unscoped** Supabase SELECTs.

This plan sequences **App Soft Read Filters**: every PMS SELECT in `src/lib/db/*` must resolve session scope and attach a company predicate before the network call.

### 0.1 In scope

| In | Out |
|----|-----|
| List / detail / aggregate **SELECT** paths in `src/lib/db/*` | INSERT stamp (`resolveWriteCompany` / `stampInsert`) — separate write stream |
| Root-table `.eq('company_id', …)` via `withCompanyEq` | Platform Admin `src/platform/**` |
| Owner-portal company eq **additive** to existing `owner_crm_id` filters | Auth claim cutover (Sprint 5) |
| Rewrite of full-table **read** scanners so filters apply before paging | Hard `NOT NULL` / hard RLS cutover |
| Verification that AI inherits scoped loaders | Creating `public.meters` app loaders (unused) |

### 0.2 Canonical read pattern (from Shared Adapter)

```
const scope = await resolveReadScope()
let q = supabase.from('<table>').select(...).eq('is_deleted', false) // domain filters as today
q = withCompanyEq(q, scope)
const { data, error } = await q
```

- Prefer filtering the **root** table; nested embeds inherit company alignment via data + RLS backstop.
- `mode === 'none'` (super admin without assume-company) → **throw**; never return global portfolio rows.
- After Package 5 closure: do **not** treat `company_id IS NULL` as ALODILA in app filters.

### 0.3 Inventory status legend (read focus)

| Status | Read-filter implication |
|--------|-------------------------|
| **Needs Company Scope** | Add `resolveReadScope` + `withCompanyEq` (and `assertRowInScope` on by-id loads where useful) |
| **Needs Rewrite** | Filter alone is insufficient or unsafe if applied naïvely (global scan, RPC, name match) — redesign then apply same helpers |
| **Already Safe** | No PMS `.from` leakage — skip |

---

## 1. Dependencies on Stream A (Shared Tenancy Adapter)

**Stream A** delivers `src/lib/tenancy/**` per `SPRINT4_SHARED_ADAPTER.md`.  
**This plan (Stream B — Read Filters) must not start coding until Stream A acceptance below is met.**

### 1.1 Hard prerequisites (block Wave 1+)

| # | Stream A deliverable | Why reads need it |
|---|----------------------|-------------------|
| A1 | `ALODILA_COMPANY_ID` constant (PMS-side, not via `src/platform`) | Default scope for legacy staff |
| A2 | `resolveCurrentCompany()` | Shared claim / persona resolution |
| A3 | `resolveReadScope()` → `{ mode, companyIds, ownerCrmId, allowUnscoped: false }` | Every SELECT |
| A4 | `withCompanyEq(query, scope)` | Applies `.eq` / throws on `mode: 'none'` |
| A5 | `assertRowInScope(row, scope)` | Detail / by-id / post-load checks |
| A6 | Import rules enforced: `db/*` → `tenancy/*`; **no** platform ↔ tenancy cycle | Safe module wiring |
| A7 | Persona matrix implemented: staff/company → `single`; owner → `owner_bounded`; super_admin without assume → `none` | Correct filter behavior |
| A8 | Legacy missing claim → ALODILA (`isDefaulted: true`) | Production single-company unchanged |

### 1.2 Soft / parallel dependencies (do not block early waves)

| Dependency | Relation to read filters |
|------------|--------------------------|
| Stream C — write stamps | Preferred before or with modules that create then immediately re-list; **not** required to soft-filter existing ALODILA SELECTs |
| Soft RLS (`SPRINT4_RLS_DESIGN.md`) | Defense in depth; app filters ship independently but claim paths must **agree** with `current_company_id()` |
| Sprint 3 Package 5 | **Already executed** — finance/ops tables have `company_id`; filters may rely on columns |
| Owner JWT always embeds `company_id` | Transition: adapter may resolve owner company from `owners` row; portal reads still add company eq |

### 1.3 Explicit non-consumers (never wire)

- `src/platform/services/companies.js` and Platform UI/hooks  
- Pure helpers with no `.from` (money, brand, i18n, most of `src/lib/ai/*` LLM wrappers)  
- Auth-only surfaces (`App.jsx` session, `ownerScope.js` assert)

### 1.4 Gate checklist before Wave 1

- [ ] Stream A merged / available on branch  
- [ ] Unit-level smoke: staff session → `mode: 'single'`, `companyIds[0] === ALODILA`  
- [ ] Owner session → `mode: 'owner_bounded'` + `ownerCrmId` set  
- [ ] Super admin without assume → `withCompanyEq` throws (no silent all-rows)  
- [ ] Inventory (`SPRINT4_APP_INVENTORY.md`) signed off for call-site coverage  

---

## 2. Wave order (overview)

Waves are **sequential for merge order**. Within a wave, files may be edited in parallel if they do not call each other for the changed SELECTs.

```
Stream A (adapter) ──► Wave 1 CRM reads
                    ──► Wave 2 Properties + Units reads
                    ──► Wave 3 Contracts reads (+ occupancy rewrite)
                    ──► Wave 4 Finance reads
                    ──► Wave 5 Maintenance reads
                    ──► Wave 6 Aggregates / Dashboard / Reports (incl. ledger rewrite)
                    ──► Wave 7 Owner Portal reads
                    ──► Wave 8 Smart Import read paths (rewrite)
                    ──► Wave 9 AI inheritance verification
```

**Rationale:** Root CRM/portfolio tables first (pickers everywhere) → dependent contracts/finance → global scanners last → portal additive → import rewrite → AI only verifies inheritance.

**Out of band (not a read-filter wave):** `ownerLookupForOnboarding` RPC — inventory **Needs Rewrite**; adapter does not wrap RPCs. Track under Sprint 5+ / separate RPC ticket; do not fake-scope via `withCompanyEq`.

---

## 3. Waves — files, exports, work

### Wave 1 — CRM list/detail reads

**Goal:** Staff lists for owners/tenants never return cross-company rows; statement loads verify tenant company.

| File | Read exports / paths to wire | Inventory status | Notes |
|------|------------------------------|------------------|-------|
| `src/lib/db/owners.js` | `getOwners`, `getOwnerById` | Needs Company Scope | Soft-delete **guard** SELECTs on related tables when present → same wave if they SELECT |
| `src/lib/db/tenants.js` | `getTenants` | Needs Company Scope | Active-contract count SELECT in `softDeleteTenant` is a read guard — scope it when touching file |
| `src/lib/db/tenantStatement.js` | `getTenantStatement` (+ nested contracts / invoices / payments SELECTs) | Needs Company Scope | Scope tenant root first; then child queries with same `scope` |

**Defer in this wave:** `ownerLookupForOnboarding` (RPC rewrite).

**Suggested merge:** single PR or two (owners/tenants, then statement).

---

### Wave 2 — Properties & Units reads

**Goal:** Property pickers, inventory, and unit lists are company-scoped.

| File | Read exports / paths | Inventory status | Notes |
|------|----------------------|------------------|-------|
| `src/lib/db/properties.js` | `getActiveProperties`, `getPropertyById`; internal SELECTs in soft-delete guards (`units`, `contracts` counts) | Needs Company Scope | Meter **columns** only — no `meters` table |
| `src/lib/db/units.js` | `getActiveUnitsByPropertyId`, `getActiveUnits`, `getUnitsInventory`; contract-guard SELECT in `softDeleteUnit` | Needs Company Scope | Embeds on `properties` — filter **units** root by `company_id` |

**UI smoke:** PropertiesList, PropertyDetail, UnitsInventory, contract/maintenance unit pickers.

---

### Wave 3 — Contracts reads (+ occupancy rewrite)

**Goal:** Contract lists/selects scoped; occupancy helper no longer scans all companies’ active contracts.

| File | Read exports / paths | Inventory status | Notes |
|------|----------------------|------------------|-------|
| `src/lib/db/contracts.js` | `getContracts`, `getActiveContractsForSelect` | Needs Company Scope | Embeds tenants/units/properties — root `contracts.company_id` |
| `src/lib/db/contracts.js` | `refreshUnitOccupancyFromContracts` | **Needs Rewrite** | Today: load **all** `status=ساري` then filter in JS. Must SELECT with `withCompanyEq` (or by unit’s company) **before** occupancy updates. Required before create/update/terminate paths are safe multi-tenant |

**Acceptance nuance:** Occupancy is a sync helper used by writes, but the defect is an unscoped **read** scan — belongs in the read-filter program.

---

### Wave 4 — Finance reads

**Goal:** Invoice/payment loaders and contract finance read-model are company-scoped.

| File | Read exports / paths | Inventory status | Notes |
|------|----------------------|------------------|-------|
| `src/lib/db/invoices.js` | `getInvoices`, `getInvoiceById`, `getInvoicesForContractIds` | Needs Company Scope | Owner-portal callers still need company eq when multi-company |
| `src/lib/db/payments.js` | `getPaymentsByInvoiceId` | Needs Company Scope | |
| `src/lib/db/contractFinance.js` | `getContractFinance`; any SELECT used before regenerate/delete pending | Needs Company Scope | Write mutations stamped in Stream C; SELECTs here |

**Depends on:** Waves 1–3 for consistent parent graphs in embeds.

---

### Wave 5 — Maintenance reads

| File | Read exports / paths | Inventory status | Notes |
|------|----------------------|------------------|-------|
| `src/lib/db/maintenance.js` | `getRequests` | Needs Company Scope | Embeds units/properties — filter `maintenance_requests` root |

**UI smoke:** MaintenanceList.

---

### Wave 6 — Aggregates, Dashboard, Reports (rewrite-heavy)

**Goal:** No full-table page scan without company predicate; KPIs and report extracts are single-company.

| File | Read exports / paths | Inventory status | Notes |
|------|----------------------|------------------|-------|
| `src/lib/db/ledgerTotals.js` | `sumPaymentsAmountAndMonth`, `sumMaintenanceCostAndMonth`, `sumInvoicesTotalAndMonth` | **Needs Rewrite** | Apply `withCompanyEq` **inside** each page loop **before** fetch; prefer single scoped query/RPC later |
| `src/lib/db/dashboard.js` | `fetchPortfolioCounts`, `getDashboardStats`, `loadAdminLedgerForAi` | **Needs Rewrite** | Counts/head queries must include company eq |
| `src/lib/db/dashboard.js` | `getRecentActivity`, `getProactiveAlerts` | Needs Company Scope (or Rewrite if limit semantics change) | Scope contracts/invoices/payments SELECTs |
| `src/lib/db/reports.js` | `getReportingPayments`, `getReportingMaintenance`, `getReportingActiveLeases` | Needs Company Scope | ReportsCenter also uses Wave 2–4 loaders — those must already be scoped |

**Depends on:** Stream A + Waves 4–5 (ledger/maintenance tables). Soft RLS optional but recommended for clone proof.

---

### Wave 7 — Owner Portal reads

**Goal:** Owner isolation remains `owner_crm_id` + session assert; **add** company eq as defense in depth.

| File | Read exports / paths | Inventory status | Notes |
|------|----------------------|------------------|-------|
| `src/lib/db/ownerPortal.js` | `resolveOwnerScope`, `getOwnerProperties`, `getOwnerPropertyById`, `getOwnerActiveContracts`, `getOwnerUnitsSummary`, `fetchOwnerPaymentsGraph`, `fetchOwnerMaintenanceGraph`, `getOwnerMaintenanceLedger`, `getOwnerReportingBundle`, `getOwnerPropertyUnits` | Needs Company Scope | `mode: 'owner_bounded'`; keep `assertOwnerCrmIdMatchesSession` |
| `src/lib/auth/ownerScope.js` | — | Already Safe | Do not break; no portfolio `.from` |

**Depends on:** Stream A owner resolution path; Waves 2–5 helpers that portal delegates to (e.g. `getActiveUnitsByPropertyId`).

---

### Wave 8 — Smart Import read paths (rewrite)

**Goal:** Import matching and lite fetches never scan other companies’ names/rows.

| File | Read exports / paths | Inventory status | Notes |
|------|----------------------|------------------|-------|
| `src/lib/db/smartImport.js` | `fetchActivePropertiesLite`, `fetchActiveUnitsLite`, `fetchActiveTenantsLite` | **Needs Rewrite** | Global match → company-scoped match |
| `src/lib/db/smartImport.js` | Read portions of `executeSmartImport` identity resolution | **Needs Rewrite** | Writes/stamps are Stream C; this wave scopes **lookup** SELECTs |

**Highest rewrite priority** per inventory — schedule after portfolio reads exist so import can reuse scoped helpers where possible.

---

### Wave 9 — AI inheritance verification (no parallel queries)

| File | Work | Inventory status | Notes |
|------|------|------------------|-------|
| `src/lib/ai/chatContext.js` | Confirm admin path only uses Wave 6 scoped loaders (`loadAdminLedgerForAi`, `getActiveProperties`, `getReportingActiveLeases`, `getOwners`); owner path via portal | Needs Rewrite → becomes safe **via db** | Prefer **no** new direct `.from` in AI |
| Other `src/lib/ai/*` | Spot-check no new unscoped DB | Already Safe | |

**Acceptance:** Grep `src/lib/ai` for `.from(` = zero; chat context only imports scoped db modules.

---

## 4. Per-wave acceptance criteria

### 4.1 Global (every wave)

1. Every new/changed SELECT on an in-scope table calls `resolveReadScope()` once per operation (or receives an already-resolved `scope` from the caller) and applies `withCompanyEq` before await.  
2. Exported function signatures remain stable for pages (no required UI prop for `companyId`).  
3. On current production sessions (legacy staff → ALODILA default), list **row counts** match pre-change baselines for ALODILA-only data.  
4. No imports from `src/platform/**` into `src/lib/db/*` or `src/lib/tenancy/*`.  
5. `mode: 'none'` never returns data (throws clear tenancy error).  
6. Lint/build for touched modules passes.

### 4.2 Wave-specific

| Wave | Acceptance |
|------|------------|
| **1** | `getOwners` / `getTenants` SQL/filters include `company_id`; `getTenantStatement` rejects or empty-results for tenant id outside company |
| **2** | `getActiveProperties` / `getUnitsInventory` scoped; by-id property/unit outside company returns null/error, not row |
| **3** | Contract lists scoped; `refreshUnitOccupancyFromContracts` does not load active contracts from other companies |
| **4** | Invoice list/detail and `getContractFinance` scoped; `getInvoicesForContractIds` still company-eq even when contract ids are prefiltered |
| **5** | `getRequests` scoped |
| **6** | Ledger page loops include company eq; dashboard KPI queries scoped; report extractors scoped; AI ledger uses scoped totals |
| **7** | Owner APIs still enforce CRM id **and** `company_id`; no regression on owner dashboard with ALODILA owner |
| **8** | Lite fetchers and import name match only within session company |
| **9** | No unscoped db path in admin chat context; owner chat still portal-scoped |

### 4.3 Cross-tenant proof (clone — after Waves 6–7 minimum)

With Soft RLS + second company clone (per RLS design):

- Company A session: zero rows from Company B on wired loaders.  
- Owner of A: cannot read B properties even if CRM ids guessed.  
- Super admin without assume: PMS list loaders fail closed (adapter), not dump all rows.

---

## 5. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Stream A incomplete or claim mismatch with RLS** | High | Gate on §1.4; align claim paths with `SPRINT4_RLS_DESIGN.md` `current_company_id()` |
| **False sense of security before RLS** | High | Document app filters as soft; do not ship second real company login until RLS clone proof |
| **Occupancy helper left global (Wave 3 skip)** | High | Treat rewrite as blocking for multi-tenant; do not mark Wave 3 done with lists only |
| **Ledger / dashboard page scans still global** | High | Wave 6 rewrite mandatory — filter inside loop, not after merge in JS |
| **Smart Import cross-tenant name collision** | High | Wave 8 rewrite before enabling second-company imports |
| **Owner portal: company eq without owner assert regression** | Medium | Keep `assertOwnerCrmIdMatchesSession`; additive only |
| **Super admin / Platform users hitting PMS routes** | Medium | `mode: 'none'` throws; Platform UI must not use these loaders |
| **Embedded selects without root filter** | Medium | Always filter root; spot-check PostgREST queries in network tab |
| **NULL `company_id` rows** | Medium | Sprint 3 aims for 0 NULLs; do not special-case NULL-as-ALODILA in app after Package 5 |
| **Write stream lagging** | Low–Med | New rows without stamp could be invisible under filters; coordinate Stream C for create paths before multi-company writes |
| **RPC onboarding still global** | Medium | Explicit defer; do not claim CRM “fully scoped” until RPC ticket closes |
| **AI bypass via stale helpers** | Low | Wave 9 grep + chatContext audit |
| **Performance: extra `getUser` per loader** | Low | Accept MVP; memoization later per adapter §6.6 |

---

## 6. Coordination with other streams

| Stream | Artifact | Coupling |
|--------|----------|----------|
| **A — Adapter** | `SPRINT4_SHARED_ADAPTER.md` → `src/lib/tenancy/**` | **Hard dependency** for all waves |
| **B — Read filters** | This document | Implements soft SELECTs |
| **C — Write stamps** | (companion plan) | Stamps inserts/updates; coordinate create+list modules |
| **D — Soft RLS** | `SPRINT4_RLS_DESIGN.md` | Parallel defense; clone proof with Waves 6–7 |
| Inventory | `SPRINT4_APP_INVENTORY.md` | Source of truth for exports/status; update status when waves land |

### 6.1 Suggested PR slicing

1. Stream A only  
2. Waves 1–2 (CRM + portfolio reads)  
3. Wave 3 (contracts + occupancy rewrite)  
4. Waves 4–5 (finance + maintenance reads)  
5. Wave 6 (aggregates rewrite)  
6. Wave 7 (owner portal)  
7. Wave 8 (smart import rewrite)  
8. Wave 9 (AI verification / chore PR)

---

## 7. Explicit non-goals

- Implementing `src/lib/tenancy/**` in this document’s workstream  
- Write stamps, UPDATE company filters, or soft-delete write wiring (Stream C)  
- SQL / RLS migrations  
- Platform companies registry changes  
- `public.meters` app integration  
- Company switcher / multi-company users  
- Hard cutover / `NOT NULL`  
- Rewriting `owner_lookup_for_onboarding` in these waves  

---

## 8. Success criteria (Stream B complete)

1. Every PMS **SELECT** listed in inventory as Needs Company Scope (read path) uses `resolveReadScope` + `withCompanyEq` (or equivalent scoped helper).  
2. Every Needs Rewrite **read** scanner (ledgerTotals, dashboard counts/AI ledger, occupancy active-contract load, smartImport lite/match) is redesigned to scope **before** aggregation/match.  
3. Production ALODILA-only behavior unchanged for legacy staff sessions.  
4. Owner portal retains CRM assert + adds company eq.  
5. AI admin/owner context has no unscoped parallel queries.  
6. Platform Admin remains outside the adapter.  
7. Two-company clone test shows zero cross-tenant rows through wired app loaders (with RLS).

---

## Document control

| Field | Value |
|-------|--------|
| Version | 0.1 DRAFT |
| Authoring agent | Agent B — App Read Filters Plan |
| Code changes | **None** — this file only |
| Depends on | Stream A Shared Adapter implementation |
| Inventory ref | `docs/SPRINT4_APP_INVENTORY.md` |
| Adapter ref | `docs/SPRINT4_SHARED_ADAPTER.md` |

---

*End of Sprint 4 App Read Filters Migration Plan*
