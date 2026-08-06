# Sprint 4 — Application Inventory (PMS Supabase Usage)

**Product:** ALODILA-PMS  
**Agent:** AGENT 3 — Application Inventory  
**Scope:** Read-only inspection of `src/` (focus `src/lib/db/*`)  
**Date:** 2026-08-04  

---

## Legend — Sprint 4 readiness

| Status | Meaning |
|--------|---------|
| **Needs Company Scope** | Query/mutation works today but never filters or stamps `company_id`. Adding session company filter + insert stamp is enough for the current shape. |
| **Needs Rewrite** | Assumes a single shared portfolio (global scans, cross-tenant name matching, unscoped sync). Company filter alone is insufficient or unsafe without redesign. |
| **Already Safe** | No PMS portfolio `.from(...)` leakage for multi-company (auth-only, pure helpers, or control-plane `companies` registry). |

**DB context (Sprint 3):** Packages 1–5 applied — `company_id` exists on `owners`, `tenants`, `properties`, `units`, `meters`, `contracts`, `invoices`, `payments`, `maintenance_requests`. **No app code** currently reads or writes `company_id` on any PMS table.

---

## Meters — column-only vs table

| Surface | Kind | App usage |
|---------|------|-----------|
| `properties.electricity_meter_count`, `properties.water_meter_count` | **Column-only** | Read/write via `src/lib/db/properties.js`; UI in PropertyCreate / PropertyDetail |
| `units.electricity_meter_ref`, `units.water_meter_ref` | **Column-only** | Read/write via `src/lib/db/units.js`, Smart Import; UI in UnitsInventory / PropertyDetail |
| `public.meters` | **Table** (DB) | Package 3 tagged `company_id`; **0 live rows**. **No** `src/**` `.from('meters')` — app does not use this table |

---

## Table → loader map (PMS)

| Table | Primary loaders | Sprint 3 `company_id` |
|-------|-----------------|----------------------|
| `owners` | `owners.js` | Package 1 ✅ |
| `tenants` | `tenants.js`, `tenantStatement.js`, embeds | Package 1 ✅ |
| `properties` | `properties.js`, `ownerPortal.js`, `smartImport.js`, `dashboard.js` | Package 2 ✅ |
| `units` | `units.js`, `contracts.js`, `ownerPortal.js`, `smartImport.js`, `dashboard.js` | Package 3 ✅ |
| `meters` | *(none in app)* | Package 3 ✅ (empty) |
| `contracts` | `contracts.js`, `contractFinance.js`, `ownerPortal.js`, `dashboard.js`, `reports.js`, `tenantStatement.js` | Package 4 ✅ |
| `invoices` | `invoices.js`, `contractFinance.js`, `ownerPortal.js`, `dashboard.js`, `ledgerTotals.js`, `tenantStatement.js` | Package 5 ✅ |
| `payments` | `payments.js`, embeds, `dashboard.js`, `reports.js`, `ledgerTotals.js`, `ownerPortal.js`, `tenantStatement.js` | Package 5 ✅ |
| `maintenance_requests` | `maintenance.js`, `dashboard.js`, `reports.js`, `ledgerTotals.js`, `ownerPortal.js` | Package 5 ✅ |
| `companies` | `src/platform/services/companies.js` only | Control-plane (Sprint 1/2) |

**RPC:** `owner_lookup_for_onboarding` — `src/lib/db/owners.js`  
**Auth only (no `.from`):** `App.jsx`, `DevLogin.jsx`, `OwnerLayout.jsx`, `AIChatbot.jsx`, `ownerScope.js`, parts of `properties.js` (`auth.getUser`)

---

## 1. CRM

### `src/lib/db/owners.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `ownerLookupForOnboarding` | RPC `owner_lookup_for_onboarding` | **Needs Rewrite** — national-id lookup is global; must become company-aware |
| `getOwners` | `owners` SELECT | **Needs Company Scope** |
| `getOwnerById` | `owners` SELECT by id | **Needs Company Scope** |
| `createOwner` | `owners` INSERT (no `company_id`) | **Needs Company Scope** |
| `updateOwner` | `owners` UPDATE | **Needs Company Scope** |
| `softDeleteOwner` | `properties` count + `owners` soft-delete | **Needs Company Scope** |

### `src/lib/db/tenants.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `getTenants` | `tenants` SELECT | **Needs Company Scope** |
| `createTenant` | `tenants` INSERT | **Needs Company Scope** |
| `updateTenant` | `tenants` UPDATE | **Needs Company Scope** |
| `softDeleteTenant` | `contracts` active count + `tenants` soft-delete | **Needs Company Scope** |

### `src/lib/db/tenantStatement.js` (CRM + Finance read-model)

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `getTenantStatement` | `tenants` → `contracts` → `invoices` → `payments` (chunked) | **Needs Company Scope** (verify tenant belongs to company) |

**UI consumers:** `src/pages/owners/OwnersList.jsx`, `src/pages/tenants/TenantsList.jsx`, `src/pages/tenants/TenantStatement.jsx`, `src/pages/auth/DevLogin.jsx` (RPC), PropertyCreate/Detail (owners), ContractsList (tenants)

---

## 2. Properties

### `src/lib/db/properties.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `getActiveProperties` | `properties` SELECT (all non-deleted) | **Needs Company Scope** |
| `getPropertyById` | `properties` SELECT by id | **Needs Company Scope** |
| `createProperty` | `auth.getUser` + `properties` INSERT (`owner_id` = auth user; meters **counts** columns) | **Needs Company Scope** |
| `updateProperty` | `properties` UPDATE (incl. meter counts) | **Needs Company Scope** |
| `softDeleteProperty` | `units` + `contracts` guard + `properties` soft-delete | **Needs Company Scope** |
| `countActiveContractsOnProperty` (internal) | `units`, `contracts` | **Needs Company Scope** |

**Meters note:** property meters are **column-only** (`electricity_meter_count`, `water_meter_count`).

**UI:** `PropertiesList.jsx`, `PropertyCreate.jsx`, `PropertyDetail.jsx`, plus many pages that load property pickers.

---

## 3. Units

### `src/lib/db/units.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `getActiveUnitsByPropertyId` | `units` by `property_id` | **Needs Company Scope** |
| `getActiveUnits` | `units` + embed `properties` (global) | **Needs Company Scope** |
| `getUnitsInventory` | `units` + embed `properties` (global) | **Needs Company Scope** |
| `bulkCreateUnits` | `units` INSERT (meter **refs** columns) | **Needs Company Scope** |
| `softDeleteUnit` | `contracts` guard + `units` soft-delete | **Needs Company Scope** |
| `updateUnit` | `units` UPDATE (incl. meter refs) | **Needs Company Scope** |

**Meters note:** unit meters are **column-only** (`electricity_meter_ref`, `water_meter_ref`). No app access to `public.meters`.

**UI:** `UnitsInventory.jsx`, `PropertyDetail.jsx`, ContractsList / MaintenanceList unit pickers.

---

## 4. Contracts

### `src/lib/db/contracts.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `refreshUnitOccupancyFromContracts` (internal) | Loads **all** `contracts` status=`ساري`, then filters unit in JS; updates `units.status` | **Needs Rewrite** — must scope by company (or by unit’s company) before scan |
| `getContracts` | `contracts` + embeds tenants/units/properties | **Needs Company Scope** |
| `getActiveContractsForSelect` | `contracts` status=`ساري` + embeds | **Needs Company Scope** |
| `createContract` | `contracts` INSERT + occupancy refresh | **Needs Company Scope** (+ rewrite dependency on occupancy helper) |
| `updateContract` | `contracts` UPDATE + occupancy refresh | **Needs Company Scope** (+ rewrite dependency) |
| `terminateContractAndSettle` | `contracts` + `deletePendingInvoicesForContract` | **Needs Company Scope** |
| `softDeleteContract` | `contracts` soft-delete + occupancy refresh | **Needs Company Scope** |

**UI:** `ContractsList.jsx`, `ContractDetail.jsx` (terminate)

---

## 5. Finance

### `src/lib/db/invoices.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `getInvoices` | `invoices` + nested contracts/tenants/units/properties/payments | **Needs Company Scope** |
| `getInvoiceById` | same, by id | **Needs Company Scope** |
| `getInvoicesForContractIds` | `invoices` `.in('contract_id', …)` (owner portal) | **Needs Company Scope** (parent contracts already owner-scoped; still need company when multi-company) |
| `createInvoice` / `updateInvoice` / `softDeleteInvoice` | `invoices` | **Needs Company Scope** |

### `src/lib/db/payments.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `getPaymentsByInvoiceId` | `payments` | **Needs Company Scope** |
| `createPayment` / `updatePayment` / `softDeletePayment` | `payments` | **Needs Company Scope** |

### `src/lib/db/contractFinance.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `generateInstallmentsForContract` | `invoices` soft-delete/insert by `contract_id` | **Needs Company Scope** |
| `deletePendingInvoicesForContract` | `invoices` (+ nested payments) | **Needs Company Scope** |
| `regeneratePendingInstallmentsForContract` | `invoices` | **Needs Company Scope** |
| `getContractFinance` | `contracts` + `invoices`/`payments` | **Needs Company Scope** |

### `src/lib/db/ledgerTotals.js` (shared finance aggregations)

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `sumPaymentsAmountAndMonth` | Full-table page scan of `payments` | **Needs Rewrite** — must filter by company before paging; prefer company-scoped query or RPC |
| `sumMaintenanceCostAndMonth` | Full-table page scan of `maintenance_requests` | **Needs Rewrite** |
| `sumInvoicesTotalAndMonth` | Full-table page scan of `invoices` | **Needs Rewrite** |

**UI:** `InvoicesList.jsx`, `InvoiceDetail.jsx`, `PaymentModal.jsx`, `ContractDetail.jsx`, ContractsList installment generation.

---

## 6. Maintenance

### `src/lib/db/maintenance.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `getRequests` | `maintenance_requests` + unit/property embeds (global) | **Needs Company Scope** |
| `createRequest` / `updateRequest` / `softDeleteRequest` | `maintenance_requests` | **Needs Company Scope** |

**UI:** `src/pages/maintenance/MaintenanceList.jsx`

---

## 7. Dashboard

### `src/lib/db/dashboard.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `fetchPortfolioCounts` (internal) | Global counts: `properties`, `units`, `contracts`, `maintenance_requests` | **Needs Rewrite** — portfolio KPIs must be company-scoped |
| `getDashboardStats` | counts + `ledgerTotals` | **Needs Rewrite** |
| `loadAdminLedgerForAi` | counts + payment/maintenance rollups | **Needs Rewrite** |
| `getRecentActivity` | recent `contracts` + `payments` (global limits) | **Needs Company Scope** (or Rewrite if limit semantics change) |
| `getProactiveAlerts` | expiring `contracts` + overdue `invoices` + `payments` | **Needs Company Scope** |

**UI:** `src/pages/dashboard/DashboardOverview.jsx`

---

## 8. Reports

### `src/lib/db/reports.js`

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `getReportingPayments` | `payments` + deep embeds (global) | **Needs Company Scope** |
| `getReportingMaintenance` | `maintenance_requests` + embeds (global) | **Needs Company Scope** |
| `getReportingActiveLeases` | `contracts` status=`ساري` + embeds (global) | **Needs Company Scope** |

**UI:** `src/pages/reports/ReportsCenter.jsx` (also pulls `getContracts`, `getInvoices`, `getUnitsInventory`)

---

## 9. AI

AI modules under `src/lib/ai/*` do **not** call Supabase `.from` directly. They consume db loaders:

| File | DB dependencies | Status |
|------|-----------------|--------|
| `src/lib/ai/chatContext.js` | `loadAdminLedgerForAi`, `getActiveProperties`, `getReportingActiveLeases`, `getOwners`; owner path uses `ownerPortal.js` | **Needs Rewrite** (admin/staff context is global portfolio); owner path **Needs Company Scope** via portal loaders |
| `src/lib/ai/aiChat.js`, `groqChat.js`, `financialAdvisor.js`, `aiMap.js`, `groqMap.js`, `groqEnv.js` | External LLM / pure logic | **Already Safe** (no PMS `.from`) |
| `src/components/AIChatbot.jsx` | `supabase.auth` + `chatContext` | Auth **Already Safe**; data path inherits chatContext status |

---

## 10. Owner Portal

### `src/lib/db/ownerPortal.js`

Scoped today by `owner_crm_id` + `assertOwnerCrmIdMatchesSession` (`src/lib/auth/ownerScope.js`). That is **owner** isolation, not **company** isolation.

| Export | Tables / ops | Status |
|--------|--------------|--------|
| `resolveOwnerScope` (internal) | `properties` → `units` → `contracts` graph | **Needs Company Scope** (owner + company) |
| `getOwnerProperties` | `properties` `.eq('owner_crm_id', …)` | **Needs Company Scope** |
| `getOwnerPropertyById` | `properties` by id + owner | **Needs Company Scope** |
| `getOwnerActiveContracts` | `contracts` `.in('unit_id', …)` | **Needs Company Scope** |
| `getOwnerUnitsSummary` | units + active contracts | **Needs Company Scope** |
| `fetchOwnerPaymentsGraph` (internal) | `invoices`, `payments` | **Needs Company Scope** |
| `fetchOwnerMaintenanceGraph` (internal) | `maintenance_requests` | **Needs Company Scope** |
| `getOwnerMaintenanceLedger` | maintenance + active tenants | **Needs Company Scope** |
| `getOwnerReportingBundle` | payments/maintenance/invoices under owner | **Needs Company Scope** |
| `getOwnerPropertyUnits` | delegates `getActiveUnitsByPropertyId` | **Needs Company Scope** |

**Auth helper:** `src/lib/auth/ownerScope.js` — `assertOwnerCrmIdMatchesSession` uses `auth.getUser` only → **Already Safe** (no portfolio `.from`; still must align JWT/company in Sprint 4 auth design).

**UI:** `OwnerDashboard.jsx`, `OwnerPropertiesList.jsx`, `OwnerPropertyDetail.jsx`, `OwnerMaintenance.jsx`, `OwnerReports.jsx`

---

## 11. Smart Import (cross-cutting CRM / Properties / Units)

### `src/lib/db/smartImport.js`

| Export / helper | Tables / ops | Status |
|-----------------|--------------|--------|
| `fetchActivePropertiesLite` | `properties` global | **Needs Rewrite** |
| `fetchActiveUnitsLite` | `units` global | **Needs Rewrite** |
| `fetchActiveTenantsLite` | `tenants` global | **Needs Rewrite** |
| `createUnitDirect` | `units` INSERT | **Needs Company Scope** (via rewrite of execute path) |
| `executeSmartImport` | Matches properties/units/tenants/owners **by name across entire DB**; creates via `createProperty` / `createTenant` / `createOwner` / unit insert | **Needs Rewrite** — cross-tenant name collision risk |

**UI:** `src/pages/import/SmartImport.jsx`

---

## 12. Control-plane — `src/platform/**` (separate)

Not part of the PMS portfolio data plane. Documented for boundary clarity only.

| Service | Path | Tables | Status (for platform) |
|---------|------|--------|------------------------|
| Companies CRUD | `src/platform/services/companies.js` | `companies` | **Already Safe** — operates on company registry itself |
| Hooks / pages / panels | `src/platform/hooks/*`, `src/platform/pages/*`, `src/platform/components/*` | via companies service | Control-plane UI |
| Feature flags / subscription / audit | `src/platform/extensions/**` | in-memory / stubs keyed by `companyId` | No PMS `.from` |
| Platform banner copy | `platform.en.js` / `platform.ar.js` | n/a | States PMS data not yet app-linked by `company_id` |

**Do not mix** platform `companies` mutations into PMS Sprint 4 company-scope work on portfolio tables.

---

## 13. Auth / session (non-loader)

| Location | Usage | Status |
|----------|-------|--------|
| `src/lib/supabase/client.js` | Client singleton | Infra |
| `src/App.jsx` | `auth.getSession` / `onAuthStateChange` | **Already Safe** |
| `src/pages/auth/DevLogin.jsx` | signIn / signUp / signOut + `ownerLookupForOnboarding` | Auth safe; RPC → see CRM |
| `src/components/OwnerLayout.jsx`, `OwnerDashboard.jsx`, `AIChatbot.jsx` | auth session for role/UI | **Already Safe** |

---

## Summary counts (PMS loaders)

| Category | Primary files | Needs Company Scope | Needs Rewrite | Already Safe |
|----------|---------------|---------------------|---------------|--------------|
| CRM | `owners.js`, `tenants.js`, `tenantStatement.js` | Most CRUD + statement | `ownerLookupForOnboarding` | — |
| Properties | `properties.js` | All exports | — | — |
| Units | `units.js` | All exports | — | — |
| Contracts | `contracts.js` | List/CRUD | `refreshUnitOccupancyFromContracts` | — |
| Finance | `invoices.js`, `payments.js`, `contractFinance.js`, `ledgerTotals.js` | Invoice/payment/contractFinance CRUD | All three `ledgerTotals` scanners | — |
| Maintenance | `maintenance.js` | All exports | — | — |
| Dashboard | `dashboard.js` | recent activity / alerts (min.) | portfolio counts + stats + AI ledger | — |
| Reports | `reports.js` | All three exports | — | — |
| AI | `chatContext.js` (+ consumers) | Owner context path | Admin/staff global context | Pure LLM helpers |
| Owner Portal | `ownerPortal.js` | All portfolio reads | — | `ownerScope` auth assert |
| Smart Import | `smartImport.js` | stamps on create | Global match/`executeSmartImport` | — |
| Meters table | — | N/A (unused in app) | — | DB-only empty table |
| Platform | `src/platform/**` | Out of PMS scope | — | `companies` registry |

### Highest Sprint 4 rewrite priorities

1. `src/lib/db/smartImport.js` — global identity matching  
2. `src/lib/db/contracts.js` → `refreshUnitOccupancyFromContracts` — full active-contract scan  
3. `src/lib/db/ledgerTotals.js` + `dashboard.js` portfolio/AI rollups — unscoped full-table aggregates  
4. `src/lib/db/owners.js` → `ownerLookupForOnboarding` RPC — company-aware onboarding  
5. `src/lib/ai/chatContext.js` admin path — depends on (3)

### Prerequisite before app filters on finance/ops tables

Package 5 (`invoices`, `payments`, `maintenance_requests` `company_id`) is **executed** — company filters may rely on those columns once Sprint 4 app work starts.

---

*End of AGENT 3 inventory. Single deliverable: `docs/SPRINT4_APP_INVENTORY.md`.*
