# Sprint 4 — Repo Optimization Notes

**Product:** ALODILA-PMS  
**Agent:** Agent 5 — READ-ONLY repo health / optimization scan  
**Scope:** Size, duplication, dead/dormant utilities, and future refactors — focus `src/lib/db/*` + `src/lib/tenancy/*`  
**Status:** Documentation only — **no code changes**  
**Date:** 2026-08-04  
**Companions:** `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_COMPANYDB_QUERY_INVENTORY.md` · `SPRINT4_APP_INVENTORY.md`

---

## 0. Executive snapshot

| Area | Finding |
|------|---------|
| **Hotspots** | UI pages dwarf `lib/db`: `ReportsCenter.jsx` (~1078 lines) is the largest file; largest db module is `ownerPortal.js` (~346 lines). |
| **Tenancy** | `src/lib/tenancy/*` (~15 KB, 9 files) is **landed but unused** by `src/lib/db/*` — zero imports outside the package. Wiring is Sprint 4 Stream B+, not deletion. |
| **Duplication** | Contract/invoice row mappers, `requireUser`, date “today ISO”, `normStr`, and `ALODILA_COMPANY_ID` appear in multiple places. |
| **Dead / low-use exports** | Thin re-exports and unused format helpers; one dead re-export of `classifyInstallment` from `contractFinance.js`. |
| **Do not optimize during Stream B** | Prefer company-scope wiring first (`withCompanyEq` / `stampInsert`). Structural splits should wait until after filters land, or be done only where they unblock tenancy. |

**Totals (approx., source lines):**

| Bucket | Files | ~KB |
|--------|------:|----:|
| `src/lib/db/*.js` | 15 | ~94 |
| `src/lib/tenancy/*.js` | 9 | ~15 |
| Raw `.from(...)` in db (per inventory) | — | **94 call sites** |

---

## 1. Oversized files

Thresholds used: **UI ≥ ~400 lines** or **≥ ~18 KB**; **lib ≥ ~250 lines** or **≥ ~9 KB**.

### 1.1 UI / pages (split candidates — post–Sprint 4 wiring)

| File | ~Lines | ~KB | Notes |
|------|-------:|----:|-------|
| `src/pages/reports/ReportsCenter.jsx` | 1078 | 50 | Multi-report monolith (VAT, NOI, delinquency, occupancy, opex). Highest ROI split: one report section / hook per file. |
| `src/pages/properties/PropertyDetail.jsx` | 769 | 37 | Units + meters + owner edit + CRUD in one page. |
| `src/pages/finance/InvoicesList.jsx` | 640 | 30 | Filters, chips, KPIs, export, payment flows. |
| `src/pages/contracts/ContractForm.jsx` | 595 | 28 | Schedule preview + form state. |
| `src/pages/contracts/ContractsList.jsx` | 419 | 19 | List + installment actions. |
| `src/pages/units/UnitsInventory.jsx` | 410 | 19 | Inventory + filters + export. |
| `src/pages/import/SmartImport.jsx` | 451 | 19 | AI map + execute UI. |
| `src/pages/dashboard/DashboardOverview.jsx` | 369 | 18 | Stats + alerts + activity. |
| `src/pages/maintenance/MaintenanceList.jsx` | 371 | 16 | Admin maintenance grid. |

### 1.2 `src/lib/db` + finance (tenancy-relevant)

| File | ~Lines | ~KB | Why it matters for Sprint 4 |
|------|-------:|----:|------------------------------|
| `src/lib/db/ownerPortal.js` | 346 | 12 | Largest db module; ~10 `.from` sites; owner graph + reporting bundle. Wave P4 in query inventory. |
| `src/lib/db/dashboard.js` | 299 | 10 | Aggregates + alerts + AI ledger; ~9 `.from`; date helpers local. Wave P3. |
| `src/lib/db/contracts.js` | 286 | 11 | 13 `.from`; occupancy rewrite risk (P0); CRUD + soft-delete. |
| `src/lib/db/smartImport.js` | 272 | 11 | Batch match + inserts; P5; local `normStr`/`canonicalKey`. |
| `src/lib/db/contractFinance.js` | 248 | 10 | Installment generate/regenerate; 9 `.from`; write stamps critical. |
| `src/lib/finance/schedule.js` | 264 | 11 | Pure finance engine (good isolation); date helpers overlap with analytics/dashboard. |
| `src/lib/analytics/reportInsights.js` | 251 | 10 | Client-side report math; duplicates “today ISO”. |
| `src/lib/ai/groqMap.js` | 239 | 10 | Import AI mapping; duplicates `normStr`. |

### 1.3 Other notable sizes

| File | ~Lines | Notes |
|------|-------:|-------|
| `src/platform/services/companies.js` | 287 | Control plane — **out of companyDb**; do not merge with PMS adapter. |
| `src/i18n/locales/phase2.{ar,en}.js` | ~288 | Locale blobs — normal; not a refactor target for tenancy. |

---

## 2. Duplicated helpers

### 2.1 High priority (touch while wiring companyDb)

| Pattern | Locations | Recommendation |
|---------|-----------|----------------|
| **`requireUser()` copy-paste** | `tenancy/resolveCurrentCompany.js`, `resolveReadScope.js`, `resolveWriteCompany.js` (identical) | Extract once to `tenancy/requireUser.js` (or private `_auth.js`) before more call sites grow. |
| **`mapContractRow`** | `db/contracts.js` (spread + flatten) vs `db/ownerPortal.js` (explicit fields + `monthly_rent`) | Shared flatten of tenant/unit/property names; owner-specific rent fields stay in ownerPortal. |
| **Invoice mapping** | `db/invoices.js` → `mapInvoice`; `db/contractFinance.js` → `mapInvoiceWithPaid` | Keep paid/remaining in finance; share nested identity flatten (tenant/unit/property/ejar). |
| **CONFIG guard string** | Nearly every `db/*.js` function: `throw new Error('Supabase is not configured…')` | Optional `assertSupabase()` in `supabase/client.js` — cosmetic; low risk. |
| **Soft-delete CRUD boilerplate** | `owners`, `tenants`, `properties`, `units`, `contracts`, `invoices`, `payments`, `maintenance` | Pattern is intentional. After `withCompanyEq` + `stampInsert`, consider a tiny `softDeleteById(table, id, scope)` helper — **only if** it doesn’t obscure table-specific guards. |

### 2.2 Medium priority (date / money / string)

| Pattern | Locations | Recommendation |
|---------|-----------|----------------|
| **Today as local ISO** | `finance/schedule.js` → `todayIso`; `analytics/reportInsights.js` → `todayIsoDate`; `db/dashboard.js` → `isoTodayLocal` | Consolidate on `todayIso` from `schedule.js` (or a tiny `lib/dates/iso.js`). |
| **Day math** | `dashboard.js` → `isoAddDaysLocal` / `daysBetweenISO`; `reportInsights.js` → `daysDiffIso` | Same date module. |
| **`normStr`** | `db/smartImport.js`, `ai/groqMap.js` | Shared `lib/text/normalize.js` if either grows further. |
| **`ALODILA_COMPANY_ID`** | `lib/tenancy/constants.js` **and** `platform/lib/constants.js` | **Intentional boundary** (PMS vs Platform Admin). Document only — do not unify imports across the boundary. |
| **Billing cycle enums** | `schedule.BILLING_CYCLES` vs local `BILLING_VALUES` in `ContractForm.jsx` | Form should import `BILLING_CYCLES` (currently unused externally). |
| **Money display** | `formatMoneyLocale` vs repeated `centsToMoneyString(moneyToCents(v))` in pages/components | Prefer one presentation helper for SAR display; keep cents math in `money/cents.js`. |

### 2.3 Thin facades (keep — not harmful)

| File | Role |
|------|------|
| `lib/ai/aiMap.js` | Re-exports `mapMessyDataWithAI` from `groqMap.js` |
| `lib/finance/contractInvoiceBase.js` | Thin wrapper over `perInstallmentSubtotalFromContract` |
| `lib/tenancy/index.js` | Public barrel for adapter |

---

## 3. Dead / dormant utilities

### 3.1 Dormant (do **not** delete — Sprint 4 deliverable)

| Surface | Status |
|---------|--------|
| Entire `src/lib/tenancy/*` | Documented in `index.js`: landed unused by `src/lib/db/*`. No app import of `companyDb` / resolvers outside the package. |
| `assumeCompanyContext.js` | Break-glass stub; unused until Super Admin assume-company UX. |

### 3.2 Likely unused exports (safe to prune later)

| Export | File | Evidence |
|--------|------|----------|
| `classifyInstallment` **re-export** | `db/contractFinance.js` | Callers import from `finance/schedule.js` only. |
| `getOwnerById` | `db/owners.js` | No callers in `src/` (lists use `getOwners`). |
| `formatNumberLocale`, `numberLocaleTag`, `moneyLocaleBase`, `moneyLocaleTag` | `format/moneyLocale.js` | No external imports; only `formatMoneyLocale` is used by pages. |
| `BILLING_CYCLES` | `finance/schedule.js` | Exported but unused; forms hardcode the same array. |
| `countInstallments` | `finance/schedule.js` | Used only inside schedule (still valuable as API). |

### 3.3 Used — do not mark dead

| Utility | Consumers |
|---------|-----------|
| `money/cents.js` | db finance, dashboard, ledger, UI |
| `ledgerTotals.js` | `dashboard.js` |
| `invoiceDerived.js` | invoices UI, reports, dashboard, analytics |
| `propertyNetIncome.js` | ReportsCenter, OwnerReports |
| `ownerPortal.js` APIs | Owner pages + `ai/chatContext.js` |
| `reports.js` | ReportsCenter + AI chat context |
| `naturalCompare` | properties/units lists + db sort |
| Print/export buttons | Lists + reports + owner portal |

### 3.4 Schema vs app (from APP_INVENTORY)

| Item | Note |
|------|------|
| `public.meters` table | Tagged `company_id` in DB; **0 app `.from('meters')`** — not dead code, unused table from app POV. |

---

## 4. Future refactors (ordered)

### Wave A — during / immediately after companyDb wiring (Sprint 4)

1. **Wire all 94 `.from` sites** via `withCompanyEq` / `stampInsert` / `assertRowInScope` per `SPRINT4_COMPANYDB_QUERY_INVENTORY.md` — primary work; avoid drive-by cleanups.
2. **Dedupe `requireUser`** inside tenancy (one shared helper).
3. **Occupancy refresh** in `contracts.js` (`refreshUnitOccupancyFromContracts`) — P0 rewrite risk; keep logic local but ensure company filter on unit/contract scans.
4. **Owner portal** — add company eq **additive** to `owner_crm_id` (do not collapse into staff CRM modules yet).

### Wave B — after multi-company smoke (Sprint 4→5)

1. **Split `ReportsCenter.jsx`** into report panels + shared filter hook (biggest maintainability win).
2. **Split `ownerPortal.js`** into `ownerPortal/properties.js`, `contracts.js`, `finance.js`, `maintenance.js` once scoped selects stabilize.
3. **Split `dashboard.js`** — counts / activity / alerts / AI ledger.
4. **Shared contract/invoice flatten helpers** under `lib/db/mappers/` once select shapes stop changing for tenancy.
5. **Shared ISO date module** — kill triple “today” implementations.
6. **Drop dead re-exports** (`contractFinance` → `classifyInstallment`; unused moneyLocale exports) in a tiny cleanup PR.

### Wave C — later / optional

1. Soft-delete + stamp helper for identical CRUD tables.
2. Collapse `aiMap.js` re-export if naming stabilizes on Groq-only.
3. Unify PrintPdf vs TargetedPdf button APIs (behavior differs; don’t merge blindly).
4. `PropertyDetail.jsx` / `InvoicesList.jsx` / `ContractForm.jsx` section splits — UI-only.

---

## 5. Tenancy-specific notes

```
src/lib/tenancy/
├── index.js                 # barrel — unused by db today
├── constants.js             # ALODILA_COMPANY_ID + TENANCY_SCOPED_TABLES
├── errors.js                # TenancyError
├── types.js                 # JSDoc-only types
├── assumeCompanyContext.js  # sessionStorage assume stub
├── resolveCurrentCompany.js # persona + company resolution (+ duplicate requireUser)
├── resolveReadScope.js      # (+ duplicate requireUser)
├── resolveWriteCompany.js   # (+ duplicate requireUser)
└── companyDb.js             # withCompanyEq, stampInsert, scopedSelect, assertRowInScope
```

| Rule | Implication for optimization |
|------|------------------------------|
| Platform Admin must not import PMS tenancy | Keep dual `ALODILA_COMPANY_ID` constants. |
| Adapter is additive soft filter | Don’t “optimize” by removing `is_deleted` filters when adding `company_id`. |
| Owner portal scopes by CRM id today | Refactors must preserve `assertOwnerCrmIdMatchesSession` + add company. |
| Smart Import matches by name | Deduping helpers ≠ fixing cross-tenant match — still Needs Rewrite (P5). |

---

## 6. Suggested “do / don’t” for the next PR

**Do**

- Import `companyDb` helpers into `src/lib/db/*` per inventory priority.
- Extract tenancy `requireUser` if touching those three files anyway.
- Leave oversized UI pages alone unless a file must change for scope bugs.

**Don’t**

- Delete `src/lib/tenancy/*` as “dead code.”
- Merge Platform `companies.js` with PMS db modules.
- Large renames/splits of `ownerPortal` / `ReportsCenter` in the same PR as first `withCompanyEq` wave.
- Unify money display across the app mid-tenancy (noise).

---

## 7. Quick reference — `src/lib/db` file map

| File | Role | Size band | companyDb priority (inventory) |
|------|------|-----------|--------------------------------|
| `owners.js` | CRM owners CRUD + onboarding RPC | S | P1 (+ P6 RPC) |
| `tenants.js` | CRM tenants CRUD | S | P1 |
| `properties.js` | Properties CRUD | M | P1 |
| `units.js` | Units CRUD / inventory | M | P1 |
| `contracts.js` | Contracts + occupancy | L | P0/P2 |
| `invoices.js` | Invoice CRUD | M | P2 |
| `payments.js` | Payment CRUD | S | P2 |
| `contractFinance.js` | Installments / finance read | L | P2 |
| `maintenance.js` | Maintenance CRUD | M | P2 |
| `tenantStatement.js` | Tenant ledger | M | P3 |
| `ledgerTotals.js` | Month rollups | S | P3 |
| `dashboard.js` | Admin dashboard + AI | L | P3 |
| `reports.js` | Reporting graphs | M | P3 |
| `ownerPortal.js` | Owner-scoped graph | L | P4 |
| `smartImport.js` | Batch import | L | P5 |

S ≤ ~120 lines · M ≤ ~200 · L ≥ ~240

---

*End of Agent 5 notes. No application or SQL changes were made.*
