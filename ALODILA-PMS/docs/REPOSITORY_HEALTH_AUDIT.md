# Repository Health Audit — ALODILA-PMS

**Date:** 2026-08-04  
**Scope:** Read-only structural audit of `ALODILA-PMS` (`src/`, `docs/`, migrations, root SQL, `api/`).  
**Method:** Import-graph reachability from `src/main.tsx` / `src/App.jsx`, unused-export scan, line-count inventory, cross-zone import map.  
**Constraint:** Findings and recommendations only — no application code changes in this audit.

---

## 1. Executive summary

| Area | Verdict |
|------|---------|
| Circular dependencies | **None detected** in `src/` static import graph |
| Truly orphan modules | **1** — `src/platform/extensions/subscription/subscriptionTypes.js` |
| Platform ↔ PMS boundary | **Mostly healthy** (App barrel only from PMS → platform); platform **does** import shared PMS UI / auth / supabase / brand / i18n |
| Dead / stale surface | Unused DB/helpers exports; unused `api/groq-*.js` proxies; root SQL + dump clutter |
| Oversized UI | Several pages >400–1100 lines (reports, property detail, invoices, contracts) |
| Migrations | **Three parallel homes** (`migrations/`, `supabase/migrations/`, root `schema_*.sql`) |
| Duplicate patterns | Platform mutation hooks nearly cloned; layout BrandHeader triplicated; AI facade + serverless proxy overlap |

Repo is operationally coherent (~143 `src` modules; platform is a clean subtree). Main health debt is **organizational sprawl** (SQL/docs/dumps), **god pages**, and **unused / stub / parallel AI paths** — not a broken dependency graph.

---

## 2. Repository shape (inventory)

### 2.1 Top-level (notable)

| Path | Role / note |
|------|-------------|
| `src/` | Application (PMS + `platform/` control plane) |
| `docs/` | Sprint / architecture blueprints |
| `migrations/` | Numbered SQL `001`–`004` (incl. platform companies) |
| `supabase/migrations/` | Packaged `005_package_1`…`5` SQL |
| `schema.sql`, `schema_*.sql` | Root-level historical / phase schemas (not under either migrations tree) |
| `api/groq-chat.js`, `api/groq-map.js` | Vercel-style serverless Groq proxies |
| `dist/` | Build output (should stay untracked / ignored in cleanup) |
| `نسخة حق ادارة املاك/` | Contains a production dump — **should not live in app repo** |
| `QA_PHASE12_REPORT.md`, `SUCCESS_CHECKLIST_OWNER_AI.md` | Root one-off docs (prefer `docs/`) |
| `backups/` (if present under app) | Dump/SQL freeze artifacts |

### 2.2 `src/` zones

| Zone | Approx. modules | Notes |
|------|-----------------|-------|
| `src/pages/**` (non-platform) | ~25 | Operator + owner portal pages |
| `src/lib/**` | ~40 | DB, finance, AI, auth, export, validation |
| `src/components/**` | shared UI + layouts | Used by PMS and platform |
| `src/platform/**` | ~48 | Control-plane admin |
| `src/i18n/**` | config + `ar.json` / `en.json` + `phase2.*.js` | Platform locales under `src/platform/i18n/` |

Entry bridge: `src/App.jsx` → `src/platform/index.js` (only PMS→platform static import).

---

## 3. Dead code

### 3.1 Unreachable module

| Path | Evidence |
|------|----------|
| `src/platform/extensions/subscription/subscriptionTypes.js` | Exports `SUBSCRIPTION_STATUSES`; never imported. Subscription UI uses `subscriptionAccessors.js` only. |

### 3.2 Unused named exports (still in reachable files)

Confirmed by repo-wide name reference scan (definition file excluded):

| Path | Unused export(s) |
|------|------------------|
| `src/lib/db/owners.js` | `getOwnerById` |
| `src/lib/db/payments.js` | `updatePayment`, `softDeletePayment` |
| `src/lib/ai/groqEnv.js` | `isAiAvailable`, `GROQ_MODEL_FALLBACKS` (array exported but only used internally via `getGroqModelChain`) |
| `src/lib/format/moneyLocale.js` | `moneyLocaleBase`, `moneyLocaleTag`, `numberLocaleTag`, `formatNumberLocale` (callers use `formatMoneyLocale` only) |
| `src/lib/sort/naturalCompare.js` | `byNatural` |
| `src/lib/supabase/authErrors.js` | `friendlyErrorMessage` |
| `src/lib/finance/schedule.js` | `BILLING_CYCLES`, `BILLING_MONTHS`, `addMonths`, `countInstallments` |
| `src/lib/validation/schemas.js` | `nationalIdOrCrSchema`, `saudiPhoneSchema` (likely only composed internally — verify before delete) |
| `src/lib/auth/roles.js` | `appRole` (used internally by `isOwnerPortalUser` / `isSuperAdminUser`; export unused externally) |
| `src/lib/analytics/reportInsights.js` | `monthRange` |
| `src/platform/extensions/flags/companyModules.js` | `getCompanyModules`, `isModuleEnabled` (UI uses `listModuleEntries`) |
| `src/platform/extensions/flags/featureFlagTypes.js` | `FEATURE_FLAG_KEYS` |
| `src/platform/lib/companyFormat.js` | `isAlodilaCompany` |
| `src/platform/lib/companyTransitions.js` | `canTransitionStatus` |
| `src/platform/lib/companyValidators.js` | `NAME_MAX`, `NOTES_MAX`, `SLUG_MAX`, `SLUG_REGEX`, `validateName`, `validateNotes`, `validateSlug`, `validateStatus` |

### 3.3 Likely-dead / superseded infrastructure

| Path | Issue |
|------|-------|
| `api/groq-chat.js`, `api/groq-map.js` | **No client import** of `/api/groq-*`. Browser AI path calls Groq directly via `VITE_GROQ_API_KEY` (`src/lib/ai/groqChat.js`, `groqEnv.js`). Proxies expect server `GROQ_API_KEY` and appear abandoned relative to current client. |
| `vercel.json` rewrite `/(.*) → /index.html` | SPA catch-all; reinforces that API routes are not part of the active client design (even if Vercel still hosts `/api`). |
| Root `schema*.sql` + phase checklists | Historical; overlap with `migrations/` and `supabase/migrations/` — not wired by app code. |
| Dump folder `نسخة حق ادارة املاك/` | Binary/SQL dump under app tree — operational risk and noise. |

### 3.4 Re-export that is dead as a public surface

| Path | Note |
|------|------|
| `src/lib/db/contractFinance.js` | `export { classifyInstallment }` — callers import `classifyInstallment` from `src/lib/finance/schedule.js` directly; re-export unused. |

### 3.5 Stub / placeholder (alive but no-op)

Not “dead,” but zero runtime effect outside DEV console:

| Path | Behavior |
|------|----------|
| `src/platform/extensions/audit/auditEmitter.js` | `record()` no-op / `console.debug` in DEV |
| `src/platform/extensions/subscription/subscriptionAccessors.js` | Hard-coded `not_configured` summary |
| `src/platform/extensions/flags/companyModules.js` | In-memory all-`false` modules |

---

## 4. Duplicate hooks

### 4.1 Platform mutation hooks (near-clones)

| Files | Duplication |
|-------|-------------|
| `src/platform/hooks/useCompanyCreate.js` | `submitting` / `error` / `fieldErrors` + try/catch mapping `VALIDATION` |
| `src/platform/hooks/useCompanyUpdate.js` | Same pattern; only differs by `updateCompany(id, …)` |

Also structurally similar (load → state → reload):

- `useCompaniesList.js`, `useCompanyDetail.js`, `useCompanyStats.js`
- Mutation siblings: `useCompanyStatus.js`, `useCompanySoftDelete.js` (error key pattern shared)

**Not duplicate features** — they wrap different service methods — but **boilerplate is duplicated**. Candidate future: one `useAsyncAction` / `useCompanyMutation` helper inside `platform/hooks/`.

### 4.2 PMS has no shared data hooks

There is **no** `src/hooks/` for PMS lists. Every list page repeats:

`useState(busy/rows/error)` + `useEffect(refresh)` + toast on failure  

Examples: `TenantsList.jsx`, `OwnersList.jsx`, `PropertiesList.jsx`, `ContractsList.jsx`, `InvoicesList.jsx`, `MaintenanceList.jsx`.

This is **pattern duplication**, not copy-pasted hook modules. Cleanup would introduce shared list hooks — lower priority than splitting god pages.

---

## 5. Duplicate services

| Pair / area | Assessment |
|-------------|------------|
| Platform `services/companies.js` vs PMS `lib/db/*` | **Correct separation** — companies registry only in platform |
| Docs mention `companiesWrite.js` (Sprint 2A) | **Not present** — writes live in `companies.js` (doc drift) |
| `lib/db/owners.js` vs `lib/db/ownerPortal.js` | Intentional (CRM CRUD vs owner-scoped reads); some report math overlaps `reports` / `propertyNetIncome` |
| `lib/db/dashboard.js` + `ledgerTotals.js` vs `lib/db/reports.js` | Related ledger/reporting queries split by consumer (AI/dashboard vs reports UI) — acceptable, but boundaries are informal |
| `api/groq-*.js` vs `lib/ai/groqChat.js` | **True duplicate capability** (server proxy vs browser direct) — only browser path is wired |

---

## 6. Duplicate utilities

| Area | Paths | Notes |
|------|-------|-------|
| AI naming facades | `lib/ai/aiMap.js` → re-exports `groqMap.js`; `aiChat.js` wraps `groqChat.js` | Thin indirection; fine, but naming `ai*` vs `groq*` is inconsistent for newcomers |
| Money display | `lib/money/cents.js` (`centsToMoneyString`) vs `lib/format/moneyLocale.js` (`formatMoneyLocale`) | Different jobs (exact string vs Intl locale) — keep both; document when to use which |
| PDF buttons | `components/PrintPdfButton.jsx` (`window.print`) vs `TargetedPdfButton.jsx` (callback) | Near-identical button shells; could share one component with mode prop |
| Layout brand chrome | `DashboardLayout.jsx`, `OwnerLayout.jsx`, `platform/layout/PlatformLayout.jsx` | Triplicated `BrandHeader` + sidebar shell + mobile drawer wiring |
| Export | `lib/export/toCsv.js` + `toExcel.js` via `ExportButton.jsx` | Healthy single facade |
| Domain labels | `lib/i18n/domainLabels.js` | Single source — good |
| Locale packs | `i18n/locales/ar.json` + `en.json` + `phase2.ar.js` / `phase2.en.js` + `platform/i18n/platform.*.js` | Three merge layers — intentional but cognitively heavy |

---

## 7. Oversized files

Threshold used: **≥ 300 lines** (source only).

### 7.1 Critical UI (>600 lines)

| Lines | Path | Cleanup hint |
|------:|------|--------------|
| 1130 | `src/pages/reports/ReportsCenter.jsx` | Split by report tab/panel components + data hooks |
| 806 | `src/pages/properties/PropertyDetail.jsx` | Extract units table, owner edit, forms |
| 684 | `src/pages/finance/InvoicesList.jsx` | Extract filters, table, payment/create modals ownership |
| 631 | `src/pages/contracts/ContractForm.jsx` | Extract schedule preview / secondary units / validation sections |

### 7.2 Large but manageable (300–500)

| Lines | Path |
|------:|------|
| 468 | `src/pages/import/SmartImport.jsx` |
| 444 | `src/pages/contracts/ContractsList.jsx` |
| 430 | `src/pages/units/UnitsInventory.jsx` |
| 398 | `src/pages/maintenance/MaintenanceList.jsx` |
| 396 | `src/lib/db/ownerPortal.js` |
| 386 | `src/pages/dashboard/DashboardOverview.jsx` |
| 371 | `src/pages/auth/DevLogin.jsx` |
| 344 | `src/platform/services/companies.js` |
| 336 | `src/lib/db/contracts.js` |
| 328 | `src/lib/db/dashboard.js` |
| 306 | `src/pages/properties/PropertyCreate.jsx` |
| 304 | `src/lib/db/smartImport.js` |
| 303 | `src/pages/finance/InvoiceDetail.jsx` |

Also large non-code: `src/i18n/locales/ar.json` / `en.json` (~980 lines each) — expected for bilingual product.

---

## 8. Circular dependencies

**Result:** Import-graph DFS found **0 cycles** among `src/**/*.{js,jsx,ts,tsx}`.

Notable one-way edges (healthy):

- `lib/db/contracts.js` → `lib/db/contractFinance.js` (`deletePendingInvoicesForContract`)
- `lib/db/contractFinance.js` does **not** import `contracts.js`
- `lib/ai/chatContext.js` → `lib/db/dashboard.js` / `reports.js` (no reverse into AI from those for context loading)

No platform ↔ PMS cycle (PMS only enters via App barrel).

---

## 9. Cross imports (platform vs PMS)

### 9.1 Intended bridge

| From | To | Status |
|------|----|--------|
| `src/App.jsx` | `src/platform/index.js` | **Only** PMS→platform import — matches Sprint 2A “delete-safe platform” intent |

### 9.2 Platform → shared PMS layers (actual)

Platform imports **shared** code outside `src/platform/` (documented blueprints forbid `lib/db/**` and PMS pages; shared UI was not fully forbidden and is widely used):

| Platform consumer area | Imports from |
|------------------------|--------------|
| Pages / forms / panels / layout | `src/components/ui/*`, `LanguageToggle`, `MobileNavDrawer`, toast |
| `PlatformGuard.jsx` | `src/lib/auth/roles.js` |
| `services/companies.js` | `src/lib/supabase/client.js` |
| `PlatformLayout.jsx` | `src/lib/brand/logoUrl.js` |
| `i18n/registerPlatformI18n.js` | `src/i18n/config.js` |

**Absent (good):** platform does **not** import `src/lib/db/**`, `src/pages/**`, `DashboardLayout`, `OwnerLayout`, or AI chatbot modules.

### 9.3 Boundary risk

- Shared UI coupling means deleting `src/components/ui` would break platform (acceptable shared kit).
- Auth/roles + supabase client are **shared kernel** — fine, but if tenancy adapters land under `src/lib/tenancy/`, keep platform companies service **out of** that adapter (already called out in `docs/SPRINT4_SHARED_ADAPTER.md`).

---

## 10. Naming inconsistencies

| Theme | Examples |
|-------|----------|
| Import extension style | Mixed: ~170 imports with `.js`/`.jsx` (esp. platform) vs ~366 without (esp. PMS `lib/` / pages) |
| Language | Mostly `.jsx`/`.js`; entry `main.tsx` + `tsc -b` while app is largely untyped JS |
| File casing | `SmartImport.jsx` vs `smartImport.js`; `TenantStatement.jsx` vs `tenantStatement.js` (page PascalCase vs lib camelCase — OK if convention documented) |
| AI API naming | `aiChat` / `aiMap` vs `groqChat` / `groqMap` / `groqEnv` |
| Auth page | `DevLogin.jsx` used as production login gate |
| Migrations numbering | `migrations/001`–`004` vs `supabase/migrations/005_package_*` vs root `schema_phase13_*.sql` |
| Docs vs code | Sprint docs reference `companiesWrite.js`, `lib/platform/*` — actual tree is `src/platform/**` with unified `companies.js` |
| i18n layers | `phase2.*` name persists after later sprints; platform keys live separately |
| Soft-delete APIs | Consistent `softDelete*` in PMS DB; platform uses soft-delete + restore vocabulary in hooks |

---

## 11. Migrations & SQL sprawl

| Location | Contents |
|----------|----------|
| `migrations/` | `001_prd_v2.sql`, `002_property_assigned_manager.sql`, `003_contracts_secondary_units.sql`, `004_platform_companies.sql` |
| `supabase/migrations/` | `005_package_1_crm_roots.sql` … `005_package_5_finance_operational.sql` |
| Repo root | `schema.sql`, `schema_owner_onboarding.sql`, `schema_owner_portal_rls.sql`, `schema_phase13_owner_financial_rls.sql`, `schema_phase14_utilities_handover.sql` |

**Health issue:** No single “source of truth” folder for applied history. Risk of applying the wrong lineage on a fresh environment. Prefer one canonical migrations path (likely `supabase/migrations/`) and archive/root-move legacy SQL under `docs/archive/sql/` or `supabase/legacy/`.

---

## 12. Suggested future cleanup (prioritized, no implementation)

### P0 — Safety / repo hygiene

1. **Remove or relocate dumps** under `نسخة حق ادارة املاك/` (and any `backups/*.dump` inside the app tree) to an external/private backup location; ensure `.gitignore` covers dumps.
2. **Clarify Groq architecture:** either wire client to `api/groq-*` (server key) **or** delete/archive unused proxies and document browser-key model as intentional.
3. **Do not commit** `dist/`, `.env.local`, or production dumps.

### P1 — Dead code & stubs

4. Delete or wire `subscriptionTypes.js`; either use `SUBSCRIPTION_STATUSES` in accessors or drop the file.
5. Remove unused DB exports (`getOwnerById`, `updatePayment`, `softDeletePayment`) **or** expose them in UI if product still needs edit/delete payments.
6. Trim unused public helpers (`isAiAvailable`, moneyLocale helpers, `byNatural`, etc.) or start using them to avoid dual APIs.
7. Drop dead `classifyInstallment` re-export from `contractFinance.js`.

### P2 — Structure & maintainability

8. **Split god pages:** `ReportsCenter.jsx`, `PropertyDetail.jsx`, `InvoicesList.jsx`, `ContractForm.jsx`.
9. Extract shared `BrandHeader` / shell from `DashboardLayout` / `OwnerLayout` / `PlatformLayout`.
10. Collapse `useCompanyCreate` / `useCompanyUpdate` boilerplate.
11. Unify import style (recommend: no extensions everywhere, or extensions everywhere — pick one; platform currently prefers extensions).
12. Consolidate SQL into one migrations tree; move root `schema_*.sql` + phase checklists into `docs/archive/`.

### P3 — Consistency & docs

13. Rename `DevLogin.jsx` → `Login.jsx` (or similar) when safe.
14. Merge or rename `phase2.*` locale files to reflect current phase.
15. Update sprint docs that still mention `companiesWrite.js` / `lib/platform/*`.
16. Optional: introduce `src/hooks/` for PMS list/refresh patterns after page splits.
17. Consider TypeScript migration only after god-page splits (today `tsc -b` + JS app is an awkward hybrid).

### Explicit non-goals (for now)

- Do **not** merge `ownerPortal.js` into `owners.js` without a tenancy design pass.
- Do **not** move platform companies service under `lib/db/` (would break delete-safe control-plane boundary).
- Do **not** invent circular “shared everything” packages that force platform ↔ PMS cycles.

---

## 13. Appendix — import-graph snapshot

- **Reachable modules:** essentially all of `src/` except `platform/extensions/subscription/subscriptionTypes.js`.
- **PMS → platform:** `App.jsx` → `platform/index.js` only.
- **Cycles:** 0.
- **Platform service rule (observed):** companies I/O confined to `src/platform/services/companies.js` (+ `companiesErrors.js`).

---

*End of audit. Generated for Agent 5 — Repository Health Audit.*
