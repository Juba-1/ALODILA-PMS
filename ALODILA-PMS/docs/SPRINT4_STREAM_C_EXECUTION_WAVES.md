# Sprint 4 — Stream C Execution Waves (App Read Filters)

**Product:** ALODILA-PMS  
**Document type:** Exact implementation execution plan (waves / files / functions / acceptance)  
**Status:** **IMPLEMENTED** (app filters landed; soft RLS not done)  
**Stream:** **C — App Read Filters**  
**Sources:** `SPRINT4_READ_FILTERS_PLAN.md` · `SPRINT4_COMPANYDB_QUERY_INVENTORY.md`  
**Governing:** `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_APP_INVENTORY.md` · `SPRINT4_RLS_DESIGN.md`  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Date:** 2026-08-04  

---

## 0. Purpose

Wire every PMS **SELECT** path under `src/lib/db/*` onto:

```
const scope = await resolveReadScope()
let q = supabase.from('<table>').select(...).eq('is_deleted', false) // domain filters as today
q = withCompanyEq(q, scope)
const { data, error } = await q
```

Plus `assertRowInScope(row, scope)` on by-id / detail loads where useful.

This document turns the read-filters plan into **exact merge-ordered waves** with file lists, function names, rewrite flags, and acceptance gates.

### 0.1 Stream lettering (this sprint)

| Stream | Work | Status relative to Stream C |
|--------|------|------------------------------|
| **A** | Shared tenancy adapter (`src/lib/tenancy/**`) | **Hard prerequisite** |
| **B** | Write stamps (`stampInsert` / write-scoped UPDATE / soft-delete) | **Hard prerequisite — must complete before Stream C coding** |
| **C** | App read filters (this document) | Starts only after A + B gates |
| **D** | Soft RLS | Parallel defense; clone proof after Waves C6–C7 |

> **Naming note:** Older draft `SPRINT4_READ_FILTERS_PLAN.md` labeled read filters as “Stream B” and writes as “Stream C”. **Canonical sprint lettering for execution is above.** Treat write stamps as Stream B and read filters as Stream C.

### 0.2 In / out

| In | Out |
|----|-----|
| List / detail / aggregate / guard **SELECT** paths in `src/lib/db/*` | INSERT / UPDATE / soft-delete stamp wiring (Stream B) |
| Root-table `.eq('company_id', …)` via `withCompanyEq` | Platform Admin `src/platform/**` |
| Owner-portal company eq **additive** to `owner_crm_id` | Auth claim cutover (Sprint 5) |
| Rewrite of full-table **read** scanners (scope before page/match) | Hard `NOT NULL` / hard RLS cutover |
| AI inheritance verification (no new `.from`) | Creating `public.meters` app loaders |
| Soft-delete **guard SELECTs** (counts on related tables) | `ownerLookupForOnboarding` RPC (deferred P6 / Sprint 5+) |

---

## 1. Hard dependency: Stream B write stamps first

### 1.1 Why Stream C must wait on Stream B

After read filters ship, every SELECT returns only rows matching session `company_id`. If inserts still omit `company_id` (or leave NULL), **new rows become invisible** under `withCompanyEq` — create-then-list and installments/import flows break.

Stream B (`SPRINT4_WRITE_STAMP_CHECKLIST.md`) must therefore land **before** Stream C Wave C1 coding starts.

### 1.2 Stream B exit gate (block Stream C)

Do **not** open Stream C until all items below are checked:

- [ ] Stream A available: `resolveReadScope`, `withCompanyEq`, `assertRowInScope`, `ALODILA_COMPANY_ID`, persona matrix
- [ ] Stream B complete for all INSERT paths: `stampInsert` / `resolveWriteCompany` on CRM, properties, units, contracts, invoices, payments, contractFinance, maintenance, smartImport creates
- [ ] Stream B complete for UPDATE / soft-delete: company eq on mutate-by-id; omit client `company_id`
- [ ] Parent-inheritance checks on child creates (units ← properties, contracts ← tenant/units, invoices ← contracts, payments ← invoices, maintenance ← units)
- [ ] Smoke: create owner/tenant/property/unit/contract/invoice/payment/maintenance under legacy staff → row has `company_id = ALODILA`
- [ ] Smoke: create then immediately list still returns the new row (pre–Stream C baseline; will remain true after filters)

### 1.3 Soft dependencies (do not block C1)

| Dependency | Relation |
|------------|----------|
| Soft RLS (Stream D) | Defense in depth; recommended before two-company clone proof |
| Sprint 3 Package 5 | Already executed — finance/ops have `company_id` columns |
| Owner JWT always embeds `company_id` | Adapter may resolve owner company from `owners` row |

### 1.4 Never wire in Stream C

- `src/platform/services/companies.js` and Platform UI/hooks  
- Pure helpers with no `.from` (money, brand, i18n, most `src/lib/ai/*` LLM wrappers)  
- Auth-only (`App.jsx` session, `ownerScope.js` assert)  
- Write mutations already owned by Stream B (except occupancy **read** rewrite in Wave C3)

---

## 2. Canonical SELECT pattern & status legend

### 2.1 Pattern

1. `scope = await resolveReadScope()` once per operation (or receive scope from caller).  
2. Build query with existing domain filters.  
3. `q = withCompanyEq(q, scope)` **before** await.  
4. Prefer filtering the **root** table; embeds inherit alignment via data + RLS backstop.  
5. `mode === 'none'` → **throw**; never return global portfolio rows.  
6. After Package 5: do **not** treat `company_id IS NULL` as ALODILA in app filters.  
7. Detail/by-id: add `assertRowInScope` where inventory marks it.

### 2.2 Inventory status (read focus)

| Status | Action in Stream C |
|--------|-------------------|
| **Needs Company Scope** | Add `resolveReadScope` + `withCompanyEq` (+ `assertRowInScope` when noted) |
| **Needs Rewrite** | Redesign so company filter applies **before** paging / JS match / occupancy scan |
| **Already Safe** | Skip (e.g. `ownerScope.js`) |

### 2.3 Helpers used (from Stream A)

| Helper | Use |
|--------|-----|
| `resolveReadScope()` | Every SELECT operation |
| `withCompanyEq(query, scope)` | Attach company predicate; throws on `mode: 'none'` |
| `assertRowInScope(row, scope)` | By-id / detail / post-load |
| `scopedSelect` | Optional shorthand for simple lists |

---

## 3. Wave overview (merge order)

Waves are **sequential for merge**. Within a wave, files may be edited in parallel if they do not call each other for the changed SELECTs.

```
Stream A (adapter) ──┐
Stream B (write stamps) ──┼──► C1 CRM reads
                          ├──► C2 Properties + Units reads
                          ├──► C3 Contracts reads (+ occupancy rewrite)
                          ├──► C4 Finance reads
                          ├──► C5 Maintenance reads
                          ├──► C6 Aggregates / Dashboard / Reports (rewrites)
                          ├──► C7 Owner Portal reads
                          ├──► C8 Smart Import read paths (rewrite)
                          └──► C9 AI inheritance verification
```

**Rationale:** Root CRM/portfolio first (pickers) → contracts/finance → global scanners → portal additive → import rewrite → AI verify-only.

**Out of band (not a Stream C wave):** `ownerLookupForOnboarding` RPC — inventory **Needs Rewrite** / P6; adapter does not wrap RPCs. Track Sprint 5+.

### 3.1 Suggested PR slicing

| PR | Contents |
|----|----------|
| (prior) | Stream A + Stream B complete |
| PR-C1 | Waves C1–C2 (CRM + portfolio reads) |
| PR-C2 | Wave C3 (contracts + occupancy rewrite) |
| PR-C3 | Waves C4–C5 (finance + maintenance reads) |
| PR-C4 | Wave C6 (aggregates rewrite) |
| PR-C5 | Wave C7 (owner portal) |
| PR-C6 | Wave C8 (smart import rewrite) |
| PR-C7 | Wave C9 (AI verification / chore) |

---

## 4. Exact execution waves

Inventory line numbers are from `SPRINT4_COMPANYDB_QUERY_INVENTORY.md` (snapshot 2026-08-04); re-verify when editing.

---

### Wave C1 — CRM list/detail reads

**Goal:** Staff owner/tenant lists never return cross-company rows; statement loads verify tenant company.  
**Depends on:** Stream A + Stream B exit gate (§1.2).  
**Inventory band:** P1 (owners/tenants) + early P3 (statement SELECTs).

| File | Function | Table | Op | Target | Status |
|------|----------|-------|----|--------|--------|
| `src/lib/db/owners.js` | `getOwners` | `owners` | S | `withCompanyEq` / `scopedSelect` | Needs Company Scope |
| `src/lib/db/owners.js` | `getOwnerById` | `owners` | S | `withCompanyEq` + `assertRowInScope` | Needs Company Scope |
| `src/lib/db/owners.js` | `softDeleteOwner` (guard) | `properties` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/tenants.js` | `getTenants` | `tenants` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/tenants.js` | `softDeleteTenant` (active-contract guard) | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/tenantStatement.js` | `getContractIdsForTenant` | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/tenantStatement.js` | `getInvoicesForContracts` | `invoices` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/tenantStatement.js` | `getPaymentsForInvoiceIds` | `payments` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/tenantStatement.js` | `getTenantStatement` | `tenants` | S | `withCompanyEq` + `assertRowInScope` | Needs Company Scope |

**Defer:** `ownerLookupForOnboarding` (RPC — not companyDb).

**Do not touch in C1:** `createOwner`, `updateOwner`, `createTenant`, `updateTenant`, soft-delete **mutations** (Stream B).

**Acceptance (C1):**

1. `getOwners` / `getTenants` filters include `company_id`.  
2. `getTenantStatement` rejects or empty-results for tenant id outside company; nested contract/invoice/payment SELECTs use same scope.  
3. Soft-delete guard SELECTs are company-scoped.  
4. Global §5.1 criteria pass.

**UI smoke:** OwnersList, TenantsList, TenantStatement.

---

### Wave C2 — Properties & Units reads

**Goal:** Property pickers, inventory, and unit lists are company-scoped.  
**Depends on:** C1 merged (or same PR if parallel and non-overlapping).  
**Inventory band:** P1.

| File | Function | Table | Op | Target | Status |
|------|----------|-------|----|--------|--------|
| `src/lib/db/properties.js` | `getActiveProperties` | `properties` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/properties.js` | `getPropertyById` | `properties` | S | `withCompanyEq` + `assertRowInScope` | Needs Company Scope |
| `src/lib/db/properties.js` | `countActiveContractsOnProperty` | `units` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/properties.js` | `countActiveContractsOnProperty` | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/units.js` | `getActiveUnitsByPropertyId` | `units` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/units.js` | `getActiveUnits` | `units` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/units.js` | `getUnitsInventory` | `units` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/units.js` | `softDeleteUnit` (guard) | `contracts` | S | `withCompanyEq` | Needs Company Scope |

**Notes:** Filter **units** / **properties** root by `company_id` (embeds inherit). Meter **columns** only — no `meters` table.

**Do not touch in C2:** `createProperty`, `bulkCreateUnits`, update/soft-delete mutations (Stream B).

**Acceptance (C2):**

1. `getActiveProperties` / `getUnitsInventory` / unit list helpers scoped.  
2. By-id property outside company → null/error, not row.  
3. Contract-count / soft-delete guards scoped.  
4. Global §5.1 criteria pass.

**UI smoke:** PropertiesList, PropertyDetail, UnitsInventory, contract/maintenance unit pickers.

---

### Wave C3 — Contracts reads (+ occupancy rewrite)

**Goal:** Contract lists/selects scoped; occupancy helper no longer scans all companies’ active contracts.  
**Depends on:** C2.  
**Inventory band:** P2 lists + **P0** occupancy rewrite.

| File | Function | Table | Op | Target | Status |
|------|----------|-------|----|--------|--------|
| `src/lib/db/contracts.js` | `getContracts` | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/contracts.js` | `getActiveContractsForSelect` | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/contracts.js` | `updateContract` (re-fetch SELECT) | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/contracts.js` | `terminateContractAndSettle` (load) | `contracts` | S | `withCompanyEq` + `assertRowInScope` | Needs Company Scope |
| `src/lib/db/contracts.js` | `softDeleteContract` (load) | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/contracts.js` | `refreshUnitOccupancyFromContracts` | `units` | S | `withCompanyEq` + assert unit in scope | **Needs Rewrite** (P0) |
| `src/lib/db/contracts.js` | `refreshUnitOccupancyFromContracts` | `contracts` | S | **Rewrite** — scope by company (or unit) **before** JS occupancy; today loads all `status=ساري` | **Needs Rewrite** (P0) |

**Blocking rule:** Do not mark C3 done with lists only. Occupancy rewrite is **required** before multi-tenant create/update/terminate paths are safe (those writes already stamped in Stream B but still call this scanner).

**Acceptance (C3):**

1. Contract list/select SELECTs include `company_id`.  
2. `refreshUnitOccupancyFromContracts` does **not** load active contracts from other companies.  
3. Terminate/soft-delete pre-load SELECTs scoped + assert where listed.  
4. Global §5.1 criteria pass.

**UI smoke:** ContractsList, ContractDetail, ContractForm select; create/update/terminate still refreshes occupancy correctly for ALODILA only.

---

### Wave C4 — Finance reads

**Goal:** Invoice/payment loaders and contract finance read-model are company-scoped.  
**Depends on:** C1–C3 (consistent parent graphs in embeds).  
**Inventory band:** P2.

| File | Function | Table | Op | Target | Status |
|------|----------|-------|----|--------|--------|
| `src/lib/db/invoices.js` | `getInvoices` | `invoices` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/invoices.js` | `getInvoiceById` | `invoices` | S | `withCompanyEq` + `assertRowInScope` | Needs Company Scope |
| `src/lib/db/invoices.js` | `getInvoicesForContractIds` | `invoices` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/payments.js` | `getPaymentsByInvoiceId` | `payments` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/contractFinance.js` | `generateInstallmentsForContract` (prep SELECT) | `invoices` | S | `withCompanyEq` by contract + company | Needs Company Scope |
| `src/lib/db/contractFinance.js` | `deletePendingInvoicesForContract` (load) | `invoices` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/contractFinance.js` | `regeneratePendingInstallmentsForContract` (load) | `invoices` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/contractFinance.js` | `getContractFinance` | `contracts` | S | `withCompanyEq` + `assertRowInScope` | Needs Company Scope |
| `src/lib/db/contractFinance.js` | `getContractFinance` | `invoices` | S | `withCompanyEq` | Needs Company Scope |

**Do not touch in C4:** INSERT/UPDATE/soft-delete on invoices/payments (Stream B already). Scope only the SELECTs that precede regenerate/delete pending.

**Acceptance (C4):**

1. Invoice list/detail and `getContractFinance` scoped.  
2. `getInvoicesForContractIds` still applies company eq even when contract ids are prefiltered.  
3. Installment prep/load SELECTs scoped.  
4. Global §5.1 criteria pass.

**UI smoke:** InvoicesList, InvoiceDetail, PaymentModal, ContractDetail finance panel.

---

### Wave C5 — Maintenance reads

**Goal:** Maintenance request list is company-scoped.  
**Depends on:** C2 (unit/property embeds).  
**Inventory band:** P2.

| File | Function | Table | Op | Target | Status |
|------|----------|-------|----|--------|--------|
| `src/lib/db/maintenance.js` | `getRequests` | `maintenance_requests` | S | `withCompanyEq` | Needs Company Scope |

**Acceptance (C5):** `getRequests` scoped on root table; embeds units/properties; global §5.1 pass.

**UI smoke:** MaintenanceList.

---

### Wave C6 — Aggregates, Dashboard, Reports (rewrite-heavy)

**Goal:** No full-table page scan without company predicate; KPIs and report extracts are single-company.  
**Depends on:** Stream A + Stream B + Waves C4–C5. Soft RLS optional but recommended for clone proof.  
**Inventory band:** **P0** scanners + P3 activity/reports.

| File | Function | Table | Op | Target | Status |
|------|----------|-------|----|--------|--------|
| `src/lib/db/ledgerTotals.js` | `sumPaymentsAmountAndMonth` | `payments` | S (paged) | **Rewrite** + `withCompanyEq` on **every** page loop before fetch | **Needs Rewrite** (P0) |
| `src/lib/db/ledgerTotals.js` | `sumMaintenanceCostAndMonth` | `maintenance_requests` | S (paged) | **Rewrite** + `withCompanyEq` | **Needs Rewrite** (P0) |
| `src/lib/db/ledgerTotals.js` | `sumInvoicesTotalAndMonth` | `invoices` | S (paged) | **Rewrite** + `withCompanyEq` | **Needs Rewrite** (P0) |
| `src/lib/db/dashboard.js` | `fetchPortfolioCounts` | `properties` | C | **Rewrite** + `withCompanyEq` | **Needs Rewrite** (P0) |
| `src/lib/db/dashboard.js` | `fetchPortfolioCounts` | `units` | S | **Rewrite** + `withCompanyEq` | **Needs Rewrite** (P0) |
| `src/lib/db/dashboard.js` | `fetchPortfolioCounts` | `contracts` | C | **Rewrite** + `withCompanyEq` | **Needs Rewrite** (P0) |
| `src/lib/db/dashboard.js` | `fetchPortfolioCounts` | `maintenance_requests` | S | **Rewrite** + `withCompanyEq` | **Needs Rewrite** (P0) |
| `src/lib/db/dashboard.js` | `getRecentActivity` | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/dashboard.js` | `getRecentActivity` | `payments` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/dashboard.js` | `getProactiveAlerts` | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/dashboard.js` | `getProactiveAlerts` | `invoices` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/dashboard.js` | `getProactiveAlerts` | `payments` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/reports.js` | `getReportingPayments` | `payments` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/reports.js` | `getReportingMaintenance` | `maintenance_requests` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/reports.js` | `getReportingActiveLeases` | `contracts` | S | `withCompanyEq` | Needs Company Scope |

**Compose-only exports (no extra `.from`; blocked until P0 wired):**

| Export | Depends on |
|--------|------------|
| `getDashboardStats` | `fetchPortfolioCounts` + `ledgerTotals` |
| `loadAdminLedgerForAi` | counts + `ledgerTotals` |

**Acceptance (C6):**

1. Ledger page loops include company eq **inside** each page fetch (not after JS merge).  
2. Dashboard KPI / head queries scoped.  
3. Report extractors scoped.  
4. AI ledger path uses scoped totals via `loadAdminLedgerForAi`.  
5. Global §5.1 criteria pass.

**UI smoke:** DashboardOverview, ReportsCenter.

---

### Wave C7 — Owner Portal reads

**Goal:** Keep `owner_crm_id` + session assert; **add** company eq as defense in depth.  
**Depends on:** Stream A owner resolution; Waves C2–C5 helpers portal delegates to (e.g. `getActiveUnitsByPropertyId`).  
**Inventory band:** P4.

| File | Function | Table | Op | Target | Status |
|------|----------|-------|----|--------|--------|
| `src/lib/db/ownerPortal.js` | `resolveOwnerScope` | `units` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/ownerPortal.js` | `resolveOwnerScope` | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/ownerPortal.js` | `getOwnerProperties` | `properties` | S | `withCompanyEq` (+ keep owner eq) | Needs Company Scope |
| `src/lib/db/ownerPortal.js` | `getOwnerPropertyById` | `properties` | S | `withCompanyEq` + `assertRowInScope` | Needs Company Scope |
| `src/lib/db/ownerPortal.js` | `getOwnerActiveContracts` | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/ownerPortal.js` | `getOwnerUnitsSummary` | `contracts` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/ownerPortal.js` | `fetchOwnerPaymentsGraph` | `invoices` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/ownerPortal.js` | `fetchOwnerPaymentsGraph` | `payments` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/ownerPortal.js` | `fetchOwnerMaintenanceGraph` | `maintenance_requests` | S | `withCompanyEq` | Needs Company Scope |
| `src/lib/db/ownerPortal.js` | `getOwnerMaintenanceLedger` | `contracts` | S | `withCompanyEq` | Needs Company Scope |

`getOwnerPropertyUnits` → delegates to `units.getActiveUnitsByPropertyId` (scoped in C2) — no extra `.from`.  
`getOwnerReportingBundle` — ensure composed reads use scoped helpers above.

| File | Work |
|------|------|
| `src/lib/auth/ownerScope.js` | **Already Safe** — do not break; no portfolio `.from` |

**Acceptance (C7):**

1. Owner APIs still enforce CRM id **and** `company_id` (`mode: 'owner_bounded'`).  
2. No regression on owner dashboard with ALODILA owner.  
3. `assertOwnerCrmIdMatchesSession` retained.  
4. Global §5.1 criteria pass.

**UI smoke:** OwnerDashboard, OwnerPropertiesList, OwnerPropertyDetail, OwnerMaintenance, OwnerReports.

---

### Wave C8 — Smart Import read paths (rewrite)

**Goal:** Import matching and lite fetches never scan other companies’ names/rows.  
**Depends on:** C1–C2 portfolio reads (reuse scoped helpers where possible). Stream B stamps for creates already done.  
**Inventory band:** **P0** match rewrite + P5 wire for lookup SELECTs.

| File | Function | Table | Op | Target | Status |
|------|----------|-------|----|--------|--------|
| `src/lib/db/smartImport.js` | `fetchActivePropertiesLite` | `properties` | S | **Rewrite** — company-scoped before name match | **Needs Rewrite** (P0) |
| `src/lib/db/smartImport.js` | `fetchActiveUnitsLite` | `units` | S | **Rewrite** | **Needs Rewrite** (P0) |
| `src/lib/db/smartImport.js` | `fetchActiveTenantsLite` | `tenants` | S | **Rewrite** | **Needs Rewrite** (P0) |
| `src/lib/db/smartImport.js` | Read portions of `executeSmartImport` identity resolution | various | S | Scope lookup SELECTs; writes remain Stream B | **Needs Rewrite** |

**Do not re-implement stamps in C8:** `createUnitDirect` / delegated creates are Stream B.

**Acceptance (C8):** Lite fetchers and import name match only within session company; global §5.1 pass.

**UI smoke:** SmartImport match against ALODILA data only; no cross-name collision from other companies in clone tests.

---

### Wave C9 — AI inheritance verification

**Goal:** Confirm AI has no parallel unscoped queries; inherits Stream C loaders.  
**Depends on:** C6 + C7 (+ C2 for `getActiveProperties` / owners).  
**Inventory band:** P6 inherit-only.

| File | Work | Status |
|------|------|--------|
| `src/lib/ai/chatContext.js` | Confirm admin path only uses scoped loaders: `loadAdminLedgerForAi`, `getActiveProperties`, `getReportingActiveLeases`, `getOwners`; owner path via portal | Needs Rewrite → safe **via db** |
| Other `src/lib/ai/*` | Spot-check no new unscoped DB | Already Safe |

**Acceptance (C9):**

1. Grep `src/lib/ai` for `.from(` = **zero**.  
2. Admin chat context only imports scoped db modules.  
3. Owner chat still portal-scoped.  
4. Global §5.1 criteria pass.

---

## 5. Acceptance criteria

### 5.1 Global (every Stream C wave)

1. Every new/changed SELECT on an in-scope table calls `resolveReadScope()` once per operation (or receives an already-resolved `scope`) and applies `withCompanyEq` before await.  
2. Exported function signatures remain stable for pages (no required UI prop for `companyId`).  
3. On current production sessions (legacy staff → ALODILA default), list **row counts** match pre-change baselines for ALODILA-only data.  
4. No imports from `src/platform/**` into `src/lib/db/*` or `src/lib/tenancy/*`.  
5. `mode: 'none'` never returns data (throws clear tenancy error).  
6. Lint/build for touched modules passes.  
7. Stream B stamps remain intact — Stream C PRs must not regress INSERT `company_id` or write-scoped UPDATEs.

### 5.2 Wave checklist (quick)

| Wave | Acceptance summary |
|------|--------------------|
| **C1** | Owners/tenants/statement SELECTs + delete guards scoped |
| **C2** | Properties/units lists + by-id + count/guards scoped |
| **C3** | Contract lists scoped; occupancy **rewrite** done |
| **C4** | Invoices/payments/contractFinance SELECTs scoped |
| **C5** | `getRequests` scoped |
| **C6** | Ledger/dashboard rewrite + reports scoped |
| **C7** | Owner portal CRM assert + company eq |
| **C8** | Smart import lite/match rewrite |
| **C9** | AI: zero direct `.from`; inherits scoped db |

### 5.3 Cross-tenant proof (clone — after C6–C7 minimum)

With Soft RLS + second company clone (per RLS design):

- Company A session: zero rows from Company B on wired loaders.  
- Owner of A: cannot read B properties even if CRM ids guessed.  
- Super admin without assume: PMS list loaders fail closed (adapter), not dump all rows.

---

## 6. SELECT call-site rollup (Stream C scope)

Approximate SELECT / count sites from inventory (excludes INSERT/UPDATE/SD mutations owned by Stream B):

| Module | File | SELECT-focused functions (Stream C) | Wave |
|--------|------|-------------------------------------|------|
| CRM | `owners.js` | `getOwners`, `getOwnerById`, softDelete guard S | C1 |
| CRM | `tenants.js` | `getTenants`, softDelete guard S | C1 |
| CRM | `tenantStatement.js` | `getContractIdsForTenant`, `getInvoicesForContracts`, `getPaymentsForInvoiceIds`, `getTenantStatement` | C1 |
| Properties | `properties.js` | `getActiveProperties`, `getPropertyById`, `countActiveContractsOnProperty` | C2 |
| Units | `units.js` | `getActiveUnitsByPropertyId`, `getActiveUnits`, `getUnitsInventory`, softDelete guard S | C2 |
| Contracts | `contracts.js` | `getContracts`, `getActiveContractsForSelect`, update/terminate/softDelete load S, `refreshUnitOccupancyFromContracts` (S rewrite) | C3 |
| Finance | `invoices.js` | `getInvoices`, `getInvoiceById`, `getInvoicesForContractIds` | C4 |
| Finance | `payments.js` | `getPaymentsByInvoiceId` | C4 |
| Finance | `contractFinance.js` | generate/delete/regenerate prep S, `getContractFinance` | C4 |
| Maintenance | `maintenance.js` | `getRequests` | C5 |
| Aggregates | `ledgerTotals.js` | all three sum\* (rewrite) | C6 |
| Dashboard | `dashboard.js` | `fetchPortfolioCounts` (rewrite), `getRecentActivity`, `getProactiveAlerts` (+ compose `getDashboardStats`, `loadAdminLedgerForAi`) | C6 |
| Reports | `reports.js` | `getReportingPayments`, `getReportingMaintenance`, `getReportingActiveLeases` | C6 |
| Owner | `ownerPortal.js` | all 10 `.from` sites listed in inventory §10 | C7 |
| Import | `smartImport.js` | three `fetchActive*Lite` + execute lookup S | C8 |
| AI | `chatContext.js` | verify inheritance only | C9 |

**Deferred / excluded:** `ownerLookupForOnboarding` RPC · Platform `companies.js` · `public.meters` · Stream B INSERT/UPDATE/SD mutations.

---

## 7. Risks (Stream C–specific)

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Stream B incomplete → invisible new rows** | **Critical** | Hard gate §1.2; do not start C1 without stamp smoke |
| **Stream A incomplete / claim mismatch with RLS** | High | Gate on adapter smoke; align with `SPRINT4_RLS_DESIGN.md` |
| **False security before RLS** | High | Soft filters only; no second real company login until RLS clone proof |
| **Occupancy helper left global (skip rewrite)** | High | C3 blocking; lists-only ≠ done |
| **Ledger / dashboard page scans still global** | High | C6 rewrite mandatory — filter inside loop |
| **Smart Import cross-tenant name collision** | High | C8 before enabling second-company imports |
| **Owner portal: company eq without owner assert regression** | Medium | Keep `assertOwnerCrmIdMatchesSession`; additive only |
| **Super admin hitting PMS routes** | Medium | `mode: 'none'` throws |
| **Embedded selects without root filter** | Medium | Always filter root; spot-check network tab |
| **NULL `company_id` rows** | Medium | Package 5 aims for 0 NULLs; no NULL-as-ALODILA after Package 5 |
| **RPC onboarding still global** | Medium | Explicit defer; do not claim CRM fully scoped until RPC ticket |
| **AI bypass via stale helpers** | Low | C9 grep + chatContext audit |
| **Performance: extra `getUser` per loader** | Low | Accept MVP; memoize later per adapter |

---

## 8. Coordination

| Stream | Artifact | Coupling to Stream C |
|--------|----------|----------------------|
| **A — Adapter** | `SPRINT4_SHARED_ADAPTER.md` → `src/lib/tenancy/**` | Hard dependency |
| **B — Write stamps** | `SPRINT4_WRITE_STAMP_CHECKLIST.md` | **Hard dependency — complete before C1** |
| **C — Read filters** | This document + `SPRINT4_READ_FILTERS_PLAN.md` | Implements soft SELECTs |
| **D — Soft RLS** | `SPRINT4_RLS_DESIGN.md` | Parallel; clone proof with C6–C7 |
| Inventory | `SPRINT4_COMPANYDB_QUERY_INVENTORY.md` · `SPRINT4_APP_INVENTORY.md` | Call-site / status source of truth; update status when waves land |

---

## 9. Explicit non-goals

- Implementing or changing `src/lib/tenancy/**` (Stream A)  
- Write stamps, UPDATE company filters, or soft-delete write wiring (Stream B)  
- SQL / RLS migrations (Stream D)  
- Platform companies registry changes  
- `public.meters` app integration  
- Company switcher / multi-company users  
- Hard cutover / `NOT NULL`  
- Rewriting `owner_lookup_for_onboarding` in these waves  

---

## 10. Success criteria (Stream C complete)

1. Every PMS **SELECT** listed in inventory as Needs Company Scope (read path) uses `resolveReadScope` + `withCompanyEq` (or equivalent scoped helper).  
2. Every Needs Rewrite **read** scanner (ledgerTotals, dashboard counts/AI ledger, occupancy active-contract load, smartImport lite/match) scopes **before** aggregation/match.  
3. Production ALODILA-only behavior unchanged for legacy staff sessions.  
4. Owner portal retains CRM assert + adds company eq.  
5. AI admin/owner context has no unscoped parallel queries.  
6. Platform Admin remains outside the adapter.  
7. Stream B stamps remain in place — create-then-list works under filters.  
8. Two-company clone test shows zero cross-tenant rows through wired app loaders (with RLS).

---

## Document control

| Field | Value |
|-------|--------|
| Version | 0.1 DRAFT |
| Authoring agent | Agent 3 — Stream C Execution Waves (READ-ONLY) |
| Code changes | **None** — this file only |
| Depends on | Stream A adapter + **Stream B write stamps** (hard) |
| Plan ref | `docs/SPRINT4_READ_FILTERS_PLAN.md` |
| Inventory ref | `docs/SPRINT4_COMPANYDB_QUERY_INVENTORY.md` |
| Write ref | `docs/SPRINT4_WRITE_STAMP_CHECKLIST.md` |

---

*End of Sprint 4 Stream C Execution Waves (App Read Filters)*
