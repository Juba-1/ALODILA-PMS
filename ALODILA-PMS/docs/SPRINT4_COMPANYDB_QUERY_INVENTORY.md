# Sprint 4 — companyDb Query Inventory

**Product:** ALODILA-PMS  
**Agent:** Agent C — companyDb migration inventory  
**Scope:** Raw Supabase `.from(...)` / select (and related write) call sites in `src/lib/db/*` that must migrate onto shared tenancy helpers (`companyDb` / `withCompanyEq` / `stampInsert` / `assertRowInScope`)  
**Governing docs:** `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_APP_INVENTORY.md` · `SPRINT4_RLS_DESIGN.md`  
**Status:** DRAFT — documentation only  
**Date:** 2026-08-04  

---

## 0. Purpose

This inventory is the **implementation checklist** for wiring `src/lib/db/*` onto the Sprint 4 shared adapter. It lists every PMS portfolio query that today hits Supabase without `company_id` filter or stamp.

Companion docs:

| Doc | Role |
|-----|------|
| `SPRINT4_SHARED_ADAPTER.md` | API contracts (`resolveReadScope`, `withCompanyEq`, `stampInsert`, …) |
| `SPRINT4_APP_INVENTORY.md` | Readiness status (Needs Company Scope / Needs Rewrite) |
| **This doc** | Call-site → helper → **migration priority** |

**Out of scope for companyDb:** `src/platform/services/companies.js` (control-plane `companies` registry).  
**Related, non-`.from`:** `owners.ownerLookupForOnboarding` RPC (deferred; not wrapped by adapter — see §12).

---

## 1. Legend

### 1.1 Priority (migration wave)

Aligned with `SPRINT4_SHARED_ADAPTER.md` §6.3, with rewrite-risk elevated.

| Priority | Meaning | When |
|----------|---------|------|
| **P0** | Unsafe global scan / cross-tenant identity — **rewrite before or with** first `withCompanyEq` | Before multi-company smoke tests |
| **P1** | Core CRM + portfolio CRUD (writes stamp → list/detail reads) | Wave 1–2 after `src/lib/tenancy/*` lands |
| **P2** | Contracts + finance + maintenance CRUD / installment helpers | Wave 2–3 |
| **P3** | Aggregates & reporting rollups | Wave 3–4 |
| **P4** | Owner portal (company eq **additive** to `owner_crm_id`) | Wave 4–5 |
| **P5** | Smart Import batch match + stamp | Wave 5–6 |
| **P6** | Inherit-only / deferred (AI via db loaders; onboarding RPC) | After loaders scoped; RPC = Sprint 5+ |

### 1.2 Adapter helper target

| Helper | Use on call site |
|--------|------------------|
| `withCompanyEq` | SELECT / UPDATE / soft-delete builders |
| `stampInsert` | INSERT payloads |
| `assertRowInScope` | Detail load / mutate-by-id after fetch |
| `scopedSelect` | Optional shorthand for simple list selects |
| **Rewrite** | Company filter alone is insufficient (see APP_INVENTORY) |

### 1.3 Op abbreviations

`S` = select · `I` = insert · `U` = update · `SD` = soft-delete update (`is_deleted`) · `C` = count/head

---

## 2. Totals

| Metric | Count |
|--------|------:|
| `src/lib/db/*.js` files with `.from(...)` | 15 |
| Raw `.from(...)` call sites | **94** |
| Related RPC (not `.from`) | 1 (`owner_lookup_for_onboarding`) |
| Related AI (no direct `.from`; inherits db) | `src/lib/ai/chatContext.js` |
| Platform excluded | `src/platform/services/companies.js` |

| Module | File | `.from` count | Priority band |
|--------|------|--------------:|---------------|
| CRM | `owners.js` | 6 | P1 (+ P6 RPC) |
| CRM | `tenants.js` | 5 | P1 |
| CRM / Finance | `tenantStatement.js` | 4 | P3 |
| Properties | `properties.js` | 7 | P1 |
| Units | `units.js` | 7 | P1 |
| Contracts | `contracts.js` | 13 | P0 occupancy + P2 CRUD |
| Finance | `invoices.js` | 6 | P2 |
| Finance | `payments.js` | 4 | P2 |
| Finance | `contractFinance.js` | 9 | P2 |
| Finance / Ops | `ledgerTotals.js` | 3 | P0 / P3 |
| Maintenance | `maintenance.js` | 4 | P2 |
| Dashboard | `dashboard.js` | 9 | P0 / P3 |
| Reports | `reports.js` | 3 | P3 |
| Owner Portal | `ownerPortal.js` | 10 | P4 |
| Import | `smartImport.js` | 4 | P0 / P5 |

---

## 3. CRM

### 3.1 `src/lib/db/owners.js` — Priority **P1** (RPC **P6**)

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `getOwners` | 23 | `owners` | S | `withCompanyEq` / `scopedSelect` | P1 |
| 2 | `getOwnerById` | 36 | `owners` | S | `withCompanyEq` + `assertRowInScope` | P1 |
| 3 | `createOwner` | 61 | `owners` | I | `stampInsert` | P1 |
| 4 | `updateOwner` | 79 | `owners` | U | `withCompanyEq` (id + company) | P1 |
| 5 | `softDeleteOwner` | 94 | `properties` | S (guard count) | `withCompanyEq` | P1 |
| 6 | `softDeleteOwner` | 103 | `owners` | SD | `withCompanyEq` | P1 |
| — | `ownerLookupForOnboarding` | 13 | RPC | rpc | **Not** companyDb; company-aware RPC later | **P6** |

### 3.2 `src/lib/db/tenants.js` — Priority **P1**

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `getTenants` | 7 | `tenants` | S | `withCompanyEq` | P1 |
| 2 | `createTenant` | 30 | `tenants` | I | `stampInsert` | P1 |
| 3 | `updateTenant` | 50 | `tenants` | U | `withCompanyEq` | P1 |
| 4 | `softDeleteTenant` | 65 | `contracts` | S (active guard) | `withCompanyEq` | P1 |
| 5 | `softDeleteTenant` | 75 | `tenants` | SD | `withCompanyEq` | P1 |

### 3.3 `src/lib/db/tenantStatement.js` — Priority **P3**

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `getContractIdsForTenant` | 12 | `contracts` | S | `withCompanyEq` | P3 |
| 2 | `getInvoicesForContracts` | 36 | `invoices` | S | `withCompanyEq` | P3 |
| 3 | `getPaymentsForInvoiceIds` | 55 | `payments` | S | `withCompanyEq` | P3 |
| 4 | `getTenantStatement` | 85 | `tenants` | S | `withCompanyEq` + `assertRowInScope` | P3 |

---

## 4. Properties

### 4.1 `src/lib/db/properties.js` — Priority **P1**

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `getActiveProperties` | 25 | `properties` | S | `withCompanyEq` | P1 |
| 2 | `getPropertyById` | 37 | `properties` | S | `withCompanyEq` + `assertRowInScope` | P1 |
| 3 | `createProperty` | 89 | `properties` | I | `stampInsert` | P1 |
| 4 | `updateProperty` | 122 | `properties` | U | `withCompanyEq` | P1 |
| 5 | `countActiveContractsOnProperty` | 135 | `units` | S | `withCompanyEq` | P1 |
| 6 | `countActiveContractsOnProperty` | 144 | `contracts` | S | `withCompanyEq` | P1 |
| 7 | `softDeleteProperty` | 165 | `properties` | SD | `withCompanyEq` | P1 |

---

## 5. Units

### 5.1 `src/lib/db/units.js` — Priority **P1**

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `getActiveUnitsByPropertyId` | 8 | `units` | S | `withCompanyEq` | P1 |
| 2 | `getActiveUnits` | 21 | `units` | S | `withCompanyEq` | P1 |
| 3 | `getUnitsInventory` | 54 | `units` | S | `withCompanyEq` | P1 |
| 4 | `bulkCreateUnits` | 104 | `units` | I | `stampInsert` (each row) | P1 |
| 5 | `softDeleteUnit` | 115 | `contracts` | S (guard) | `withCompanyEq` | P1 |
| 6 | `softDeleteUnit` | 125 | `units` | SD | `withCompanyEq` | P1 |
| 7 | `updateUnit` | 151 | `units` | U | `withCompanyEq` | P1 |

---

## 6. Contracts

### 6.1 `src/lib/db/contracts.js` — Priority **P0** (occupancy) + **P2** (CRUD)

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `refreshUnitOccupancyFromContracts` | 83 | `units` | S | `withCompanyEq` + assert unit in scope | P0 |
| 2 | `refreshUnitOccupancyFromContracts` | 95 | `contracts` | S | **Rewrite** — today loads all `ساري` then filters in JS; must scope by company (or unit) before scan | **P0** |
| 3 | `refreshUnitOccupancyFromContracts` | 112 | `units` | U | `withCompanyEq` | P0 |
| 4 | `getContracts` | 120 | `contracts` | S | `withCompanyEq` | P2 |
| 5 | `getActiveContractsForSelect` | 136 | `contracts` | S | `withCompanyEq` | P2 |
| 6 | `createContract` | 204 | `contracts` | I | `stampInsert` | P2 |
| 7 | `createContract` (rollback) | 218 | `contracts` | SD | `withCompanyEq` | P2 |
| 8 | `updateContract` | 232 | `contracts` | U | `withCompanyEq` | P2 |
| 9 | `updateContract` (re-fetch) | 261 | `contracts` | S | `withCompanyEq` | P2 |
| 10 | `terminateContractAndSettle` | 289 | `contracts` | S | `withCompanyEq` + `assertRowInScope` | P2 |
| 11 | `terminateContractAndSettle` | 300 | `contracts` | U | `withCompanyEq` | P2 |
| 12 | `softDeleteContract` | 322 | `contracts` | S | `withCompanyEq` | P2 |
| 13 | `softDeleteContract` | 329 | `contracts` | SD | `withCompanyEq` | P2 |

> **Note:** Create/update/soft-delete call `refreshUnitOccupancyFromContracts` — P2 CRUD must not ship until P0 occupancy rewrite is done (or occupancy is temporarily gated).

---

## 7. Finance

### 7.1 `src/lib/db/invoices.js` — Priority **P2**

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `getInvoices` | 68 | `invoices` | S | `withCompanyEq` | P2 |
| 2 | `getInvoiceById` | 83 | `invoices` | S | `withCompanyEq` + `assertRowInScope` | P2 |
| 3 | `getInvoicesForContractIds` | 103 | `invoices` | S | `withCompanyEq` | P2 |
| 4 | `createInvoice` | 126 | `invoices` | I | `stampInsert` | P2 |
| 5 | `updateInvoice` | 148 | `invoices` | U | `withCompanyEq` | P2 |
| 6 | `softDeleteInvoice` | 163 | `invoices` | SD | `withCompanyEq` | P2 |

### 7.2 `src/lib/db/payments.js` — Priority **P2**

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `getPaymentsByInvoiceId` | 7 | `payments` | S | `withCompanyEq` | P2 |
| 2 | `createPayment` | 28 | `payments` | I | `stampInsert` | P2 |
| 3 | `updatePayment` | 46 | `payments` | U | `withCompanyEq` | P2 |
| 4 | `softDeletePayment` | 60 | `payments` | SD | `withCompanyEq` | P2 |

### 7.3 `src/lib/db/contractFinance.js` — Priority **P2**

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `generateInstallmentsForContract` | 84 | `invoices` | S / SD prep | `withCompanyEq` by `contract_id` + company | P2 |
| 2 | `generateInstallmentsForContract` | 113 | `invoices` | I | `stampInsert` (batch) | P2 |
| 3 | `deletePendingInvoicesForContract` | 130 | `invoices` | S | `withCompanyEq` | P2 |
| 4 | `deletePendingInvoicesForContract` | 144 | `invoices` | SD | `withCompanyEq` | P2 |
| 5 | `regeneratePendingInstallmentsForContract` | 169 | `invoices` | S | `withCompanyEq` | P2 |
| 6 | `regeneratePendingInstallmentsForContract` | 180 | `invoices` | SD | `withCompanyEq` | P2 |
| 7 | `regeneratePendingInstallmentsForContract` | 215 | `invoices` | I | `stampInsert` | P2 |
| 8 | `getContractFinance` | 239 | `contracts` | S | `withCompanyEq` + `assertRowInScope` | P2 |
| 9 | `getContractFinance` | 249 | `invoices` | S | `withCompanyEq` | P2 |

### 7.4 `src/lib/db/ledgerTotals.js` — Priority **P0** / **P3**

Full-table page scans — company filter **required** before paging; prefer scoped query or RPC.

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `sumPaymentsAmountAndMonth` | 25 | `payments` | S (paged) | **Rewrite** + `withCompanyEq` on every page | **P0** |
| 2 | `sumMaintenanceCostAndMonth` | 63 | `maintenance_requests` | S (paged) | **Rewrite** + `withCompanyEq` | **P0** |
| 3 | `sumInvoicesTotalAndMonth` | 101 | `invoices` | S (paged) | **Rewrite** + `withCompanyEq` | **P0** |

---

## 8. Maintenance

### 8.1 `src/lib/db/maintenance.js` — Priority **P2**

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `getRequests` | 16 | `maintenance_requests` | S | `withCompanyEq` | P2 |
| 2 | `createRequest` | 70 | `maintenance_requests` | I | `stampInsert` | P2 |
| 3 | `updateRequest` | 123 | `maintenance_requests` | U | `withCompanyEq` | P2 |
| 4 | `softDeleteRequest` | 160 | `maintenance_requests` | SD | `withCompanyEq` | P2 |

---

## 9. Dashboard & Reports

### 9.1 `src/lib/db/dashboard.js` — Priority **P0** (portfolio) + **P3** (activity/alerts)

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `fetchPortfolioCounts` | 37 | `properties` | C | **Rewrite** + `withCompanyEq` | **P0** |
| 2 | `fetchPortfolioCounts` | 38 | `units` | S | **Rewrite** + `withCompanyEq` | **P0** |
| 3 | `fetchPortfolioCounts` | 40 | `contracts` | C | **Rewrite** + `withCompanyEq` | **P0** |
| 4 | `fetchPortfolioCounts` | 45 | `maintenance_requests` | S | **Rewrite** + `withCompanyEq` | **P0** |
| 5 | `getRecentActivity` | 146 | `contracts` | S | `withCompanyEq` | P3 |
| 6 | `getRecentActivity` | 163 | `payments` | S | `withCompanyEq` | P3 |
| 7 | `getProactiveAlerts` | 233 | `contracts` | S | `withCompanyEq` | P3 |
| 8 | `getProactiveAlerts` | 255 | `invoices` | S | `withCompanyEq` | P3 |
| 9 | `getProactiveAlerts` | 294 | `payments` | S | `withCompanyEq` | P3 |

Exports that **compose** scoped helpers (no extra `.from` of their own, but blocked until P0):

| Export | Depends on | Pri |
|--------|------------|-----|
| `getDashboardStats` | `fetchPortfolioCounts` + `ledgerTotals` | P0 |
| `loadAdminLedgerForAi` | counts + `ledgerTotals` | P0 |

### 9.2 `src/lib/db/reports.js` — Priority **P3**

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `getReportingPayments` | 7 | `payments` | S | `withCompanyEq` | P3 |
| 2 | `getReportingMaintenance` | 61 | `maintenance_requests` | S | `withCompanyEq` | P3 |
| 3 | `getReportingActiveLeases` | 114 | `contracts` | S | `withCompanyEq` | P3 |

---

## 10. Owner Portal

### 10.1 `src/lib/db/ownerPortal.js` — Priority **P4**

Today scoped by `owner_crm_id` + `assertOwnerCrmIdMatchesSession`. Sprint 4 adds **company** eq on every root query (adapter `persona: owner`).

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `resolveOwnerScope` | 58 | `units` | S | `withCompanyEq` | P4 |
| 2 | `resolveOwnerScope` | 70 | `contracts` | S | `withCompanyEq` | P4 |
| 3 | `getOwnerProperties` | 119 | `properties` | S | `withCompanyEq` (+ keep owner eq) | P4 |
| 4 | `getOwnerPropertyById` | 137 | `properties` | S | `withCompanyEq` + `assertRowInScope` | P4 |
| 5 | `getOwnerActiveContracts` | 159 | `contracts` | S | `withCompanyEq` | P4 |
| 6 | `getOwnerUnitsSummary` | 185 | `contracts` | S | `withCompanyEq` | P4 |
| 7 | `fetchOwnerPaymentsGraph` | 202 | `invoices` | S | `withCompanyEq` | P4 |
| 8 | `fetchOwnerPaymentsGraph` | 215 | `payments` | S | `withCompanyEq` | P4 |
| 9 | `fetchOwnerMaintenanceGraph` | 243 | `maintenance_requests` | S | `withCompanyEq` | P4 |
| 10 | `getOwnerMaintenanceLedger` | 299 | `contracts` | S | `withCompanyEq` | P4 |

`getOwnerPropertyUnits` delegates to `units.getActiveUnitsByPropertyId` (P1) — no extra `.from`.

---

## 11. Smart Import

### 11.1 `src/lib/db/smartImport.js` — Priority **P0** (match) + **P5** (wire)

| # | Function | Line(s) | Table | Op | companyDb target | Pri |
|---|----------|---------|-------|----|------------------|-----|
| 1 | `fetchActivePropertiesLite` | 47 | `properties` | S | **Rewrite** — must be company-scoped before name match | **P0** |
| 2 | `fetchActiveUnitsLite` | 56 | `units` | S | **Rewrite** | **P0** |
| 3 | `fetchActiveTenantsLite` | 65 | `tenants` | S | **Rewrite** | **P0** |
| 4 | `createUnitDirect` | 74 | `units` | I | `stampInsert` | P5 |

`executeSmartImport` also creates via `createProperty` / `createTenant` / `createOwner` / `updateUnit` — those inherit P1 stamps once wired; **name-collision rewrite** remains P0.

---

## 12. Related (no direct `.from` in `lib/db`, still on migration path)

| Surface | Path | Relation to companyDb | Pri |
|---------|------|----------------------|-----|
| Onboarding RPC | `owners.ownerLookupForOnboarding` | Adapter does **not** wrap RPCs; company-aware NID lookup deferred (Sprint 5+) | P6 |
| AI staff context | `src/lib/ai/chatContext.js` | Uses `loadAdminLedgerForAi`, `getActiveProperties`, `getReportingActiveLeases`, `getOwners` — inherits after P0/P1/P3 | P6 |
| AI owner context | same | Uses `ownerPortal.js` — inherits after P4 | P6 |
| Owner assert | `src/lib/auth/ownerScope.js` | Auth only; stays separate from companyDb | — |
| Platform registry | `src/platform/services/companies.js` | **Must not** import companyDb | — |
| `public.meters` | — | No app `.from('meters')` | — |

---

## 13. Suggested implementation order (checklist)

Use with `SPRINT4_SHARED_ADAPTER.md` §6.3.

| Step | Work | Call sites (approx.) | Pri |
|------|------|---------------------:|-----|
| 0 | Land `src/lib/tenancy/*` (default ALODILA) | — | — |
| 1 | **Rewrite** occupancy scan, ledger page scans, dashboard portfolio counts, smart-import match loaders | ~12 | P0 |
| 2 | Stamp + filter: `owners`, `tenants`, `properties`, `units` | ~25 | P1 |
| 3 | Stamp + filter: `contracts` CRUD, `invoices`, `payments`, `contractFinance`, `maintenance` | ~36 | P2 |
| 4 | Filter: `tenantStatement`, `dashboard` activity/alerts, `reports` | ~10 | P3 |
| 5 | Additive company eq: `ownerPortal` | 10 | P4 |
| 6 | Finish smart import create path + execute rewrite | 4 + execute | P5 |
| 7 | Verify AI / RPC out-of-band | 0 `.from` | P6 |

**Success criteria (from adapter):** every PMS SELECT in `src/lib/db/*` uses read scope; every INSERT stamps `company_id`; platform registry untouched; single-company ALODILA behavior unchanged.

---

## 14. Table → call-site index

| Table | Files touching `.from(table)` | Waves |
|-------|-------------------------------|-------|
| `owners` | `owners.js` | P1 |
| `tenants` | `tenants.js`, `tenantStatement.js`, `smartImport.js` | P1 / P3 / P0 |
| `properties` | `properties.js`, `owners.js`, `dashboard.js`, `ownerPortal.js`, `smartImport.js` | P1 / P0 / P4 |
| `units` | `units.js`, `properties.js`, `contracts.js`, `dashboard.js`, `ownerPortal.js`, `smartImport.js` | P1 / P0 / P4 |
| `contracts` | `contracts.js`, `properties.js`, `tenants.js`, `units.js`, `contractFinance.js`, `tenantStatement.js`, `dashboard.js`, `reports.js`, `ownerPortal.js` | P0–P4 |
| `invoices` | `invoices.js`, `contractFinance.js`, `ledgerTotals.js`, `tenantStatement.js`, `dashboard.js`, `ownerPortal.js` | P0 / P2 / P3 / P4 |
| `payments` | `payments.js`, `ledgerTotals.js`, `tenantStatement.js`, `dashboard.js`, `reports.js`, `ownerPortal.js` | P0 / P2 / P3 / P4 |
| `maintenance_requests` | `maintenance.js`, `ledgerTotals.js`, `dashboard.js`, `reports.js`, `ownerPortal.js` | P0 / P2 / P3 / P4 |
| `companies` | *(platform only — excluded)* | — |
| `meters` | *(none in app)* | — |

---

## Document control

| Field | Value |
|-------|--------|
| Version | 0.1 DRAFT |
| Authoring agent | Agent C — companyDb Query Inventory |
| Implementation | **Not started** — inventory only |
| Raw `.from` total | 94 in `src/lib/db` |
| ALODILA UUID | `a1000000-a10d-4000-8000-000000000001` |

---

*End of Sprint 4 companyDb query inventory. Single deliverable: `docs/SPRINT4_COMPANYDB_QUERY_INVENTORY.md`.*
