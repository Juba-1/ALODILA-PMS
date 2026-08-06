# Sprint 3 — Tenancy Execution Log & Package Plans

**Product:** ALODILA-PMS  
**Production project:** `ryfqqyrqmsyngwcsfjug`  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Governing plans:** Sprint 3A Discovery (approved) · Sprint 3B Execution Plan (approved)

---

## Package 1 — CRM Roots — **COMPLETED**

| Field | Value |
|-------|--------|
| **Status** | **COMPLETED** |
| **Tables** | `public.owners`, `public.tenants` |
| **Migration file** | `supabase/migrations/005_package_1_crm_roots.sql` |
| **Supabase migration name** | `package_1_crm_roots` |
| **Migration version** | `20260804164018` |
| **Execution date** | 2026-08-04 (Sprint 3D) |
| **Production status** | Applied successfully on live ALODILA-PMS |

### Validation results (post-execute)

| Table | Total | `company_id` NULL | ALODILA UUID |
|-------|------:|------------------:|-------------:|
| `owners` | 1 | 0 | 1 |
| `tenants` | 27 | 0 | 27 |

| Check | Result |
|-------|--------|
| `owners_company_id_fkey` | Present |
| `tenants_company_id_fkey` | Present |
| Indexes `owners_company_id_idx`, `tenants_company_id_idx` | Present |
| Other public tables with `company_id` | None (Package 1 scope held) |
| Runner warnings | None |

### Smoke test

| Check | Result |
|-------|--------|
| Staff login | Passed (manual) |
| Dashboard | Passed (manual) |
| Owners list / details | Passed (manual) |
| Tenants list / details | Passed (manual) |
| **Overall** | **PASSED** |

### Notes

- `company_id` remains **nullable** (NOT NULL deferred).
- No RLS / Auth / app changes in Package 1.
- Contaminant tables untouched.
- **Do not re-run** Migration 005 unless intentional / approved.

---

## Package 2 — Portfolio Root (`properties`) — **COMPLETED**

| Field | Value |
|-------|--------|
| **Status** | **COMPLETED** |
| **Tables** | `public.properties` |
| **Migration file** | `supabase/migrations/005_package_2_properties.sql` |
| **Supabase migration name** | `package_2_properties` |
| **Migration version** | `20260804170440` |
| **Execution date** | 2026-08-04 (Sprint 3C/3D) |
| **Production status** | Applied successfully on live ALODILA-PMS |

### Validation results (post-execute)

| Table | Total | `company_id` NULL | ALODILA UUID |
|-------|------:|------------------:|-------------:|
| `properties` | 2 | 0 | 2 |

| Check | Result |
|-------|--------|
| `properties_company_id_fkey` | Present |
| Index `properties_company_id_idx` | Present |
| Other public tables with `company_id` beyond owners/tenants/properties | None (Package 2 scope held) |
| Runner warnings / errors | None |

### Smoke test

| Check | Result |
|-------|--------|
| Staff login | Passed (manual) |
| Dashboard | Passed (manual) |
| Properties list / detail | Passed (manual) |
| Property create/edit UI | Passed (manual) |
| Owner portal properties (if used) | Passed (manual) |
| Owners / tenants regression (P1) | Passed (manual) |
| Platform Admin companies | Passed (manual) |
| **Overall** | **PASSED** |

### Notes

- `company_id` remains **nullable** (NOT NULL deferred).
- No RLS / Auth / app changes in Package 2.
- Expected: `updated_at` bumped on backfilled rows via `set_updated_at_properties`.
- Contaminant tables untouched. Units/meters untouched.
- **Do not re-run** this migration unless intentional / approved.
- Package 2 **OFFICIALLY CLOSED** 2026-08-04 after validation + smoke.

---

## Package 3 — Unit Layer (`units`, `meters`) — **COMPLETED**

| Field | Value |
|-------|--------|
| **Status** | **COMPLETED** |
| **Tables** | `public.units`, `public.meters` |
| **Migration file** | `supabase/migrations/005_package_3_units_meters.sql` |
| **Supabase migration name** | `package_3_units_meters` |
| **Migration version** | `20260804172550` |
| **Execution date** | 2026-08-04 |
| **Production status** | Applied successfully on live ALODILA-PMS |

### Validation results (post-execute)

| Table | Total | `company_id` NULL | ALODILA UUID |
|-------|------:|------------------:|-------------:|
| `units` | 48 | 0 | 48 |
| `meters` | 0 | 0 | 0 |

| Check | Result |
|-------|--------|
| `units_company_id_fkey` | Present |
| `meters_company_id_fkey` | Present |
| Indexes `units_company_id_idx`, `meters_company_id_idx` | Present |
| Other public tables with `company_id` beyond owners/tenants/properties/units/meters | None (Package 3 scope held) |
| Runner warnings / errors | None |

### Smoke test

| Check | Result |
|-------|--------|
| Manual smoke | **PASSED** (manual) |

### Notes

- `company_id` remains **nullable** (NOT NULL deferred).
- No RLS / Auth / app changes in Package 3.
- Expected: `updated_at` bumped on ~48 units via `set_updated_at_units` (meters: 0 rows).
- Contracts / `secondary_unit_ids` / invoices / payments untouched.
- **Do not re-run** this migration unless intentional / approved.
- Package 3 **CLOSED** after validation + smoke.

---

## Package 4 — Contracts (`contracts`) — **COMPLETED**

| Field | Value |
|-------|--------|
| **Status** | **COMPLETED** |
| **Tables** | `public.contracts` |
| **Migration file** | `supabase/migrations/005_package_4_contracts.sql` |
| **Supabase migration name** | `package_4_contracts` |
| **Migration version** | `20260804173302` |
| **Execution date** | 2026-08-04 |
| **Production status** | Applied successfully on live ALODILA-PMS |

### Validation results (post-execute)

| Table | Total | `company_id` NULL | ALODILA UUID |
|-------|------:|------------------:|-------------:|
| `contracts` | 28 | 0 | 28 |

| Check | Result |
|-------|--------|
| `contracts_company_id_fkey` | Present |
| Index `contracts_company_id_idx` | Present |
| Scope (no unexpected `company_id` tables) | Held |
| JSON sanity (`secondary_unit_ids` nonempty count) | 3 (unchanged vs pre-flight) |
| Runner warnings / errors | None |

### Smoke test

| Check | Result |
|-------|--------|
| Manual smoke | **PASSED** (manual) |

### Notes

- `company_id` remains **nullable** (NOT NULL deferred).
- No RLS / Auth / app changes; `unit_id` / `tenant_id` / `secondary_unit_ids` untouched.
- Expected: `updated_at` bumped on 28 rows via `set_updated_at_contracts`.
- Invoices / payments / maintenance untouched.
- **Do not re-run** this migration unless intentional / approved.
- Package 4 **CLOSED** 2026-08-04 after validation + smoke.

---

## Package 5 — Finance + Operational — **COMPLETED**

| Field | Value |
|-------|--------|
| **Status** | **COMPLETED** (awaiting Package 5 manual smoke sign-off) |
| **Tables** | `public.invoices`, `public.payments`, `public.maintenance_requests` |
| **Migration file** | `supabase/migrations/005_package_5_finance_operational.sql` |
| **Supabase migration name** | `package_5_finance_operational` |
| **Migration version** | `20260804174954` |
| **Execution date** | 2026-08-04 |
| **Production status** | Applied successfully on live ALODILA-PMS |

### Validation results (post-execute)

| Table | Total | `company_id` NULL | ALODILA UUID |
|-------|------:|------------------:|-------------:|
| `invoices` | 269 | 0 | 269 |
| `payments` | 111 | 0 | 111 |
| `maintenance_requests` | 0 | 0 | 0 |

| Check | Result |
|-------|--------|
| `invoices_company_id_fkey` | Present |
| `payments_company_id_fkey` | Present |
| `maintenance_requests_company_id_fkey` | Present |
| Indexes `*_company_id_idx` (all three) | Present |
| Scope (unexpected `company_id` tables) | None beyond PMS cores + `companies` |
| Runner warnings / errors | None |

### Smoke test

| Check | Result |
|-------|--------|
| Manual smoke | **Pending user confirmation** |

### Notes

- `company_id` remains **nullable** (NOT NULL deferred).
- No RLS / Auth / app changes in Package 5.
- Expected: `updated_at` bumped on invoices (~269) and payments (~111) via triggers.
- **Do not re-run** this migration unless intentional / approved.

---

## Sprint 3 — **COMPLETED** (DDL exit)

| Field | Value |
|-------|--------|
| **Status** | **COMPLETED** (Package 5 smoke pending for operational close) |
| **Packages** | 1–5 all applied on production |
| **Exit met** | `company_id` present on owners, tenants, properties, units, meters, contracts, invoices, payments, maintenance_requests |
| **Deferred** | NOT NULL · soft RLS · app company filters · Auth claim cutover → **Sprint 4+** |
| **Sprint 4** | Stream C app read filters **IMPLEMENTED**; soft RLS (Stream D) **not done** |

---

## Package 2 — Planning archive (pre-execute)

**Status at planning time:** DRAFT — later executed and closed (see COMPLETED block above)

### 1. Package 2 scope

**In scope (ONLY):**
- `public.properties`

**Out of scope (explicit):**
- `units`, `meters`, `contracts`, `invoices`, `payments`, `maintenance_requests`
- `owners`, `tenants` (already done in Package 1)
- `companies`, contaminants, Auth, RLS, app code, `NOT NULL`

### 2. Dependency analysis

| Dependency | Status / note |
|------------|----------------|
| `public.companies` + ALODILA seed | Required (exists) |
| Package 1 (`owners`, `tenants`) | **Completed** — owners tagged; properties still link via existing `owner_crm_id` FK |
| `units` / children | Must **not** be altered; they still lack `company_id` until later packages |
| App / RLS | No dependency — nullable unused column is invisible to current SELECTs |

**Hard prerequisite to execute Package 2:** Package 1 COMPLETED (met).

**Does not require:** Package 3+ to exist.

### 3. Why properties are isolated

1. **Single portfolio root** — parent of `units` and `meters`; isolating it keeps blast radius to ~2 live rows.  
2. **Clear dependency cut** — Package 1 = CRM parties; Package 2 = portfolio container; Package 3 = unit layer.  
3. **Independent rollback** — failing properties migration does not require rolling back finance/contracts.  
4. **Sprint 3B approved structure** — Package 2 was defined as `properties` alone.  
5. **Owner portal path** — properties are the portal surface via `owner_crm_id`; tagging them alone is a natural checkpoint before units.

### 4. Migration strategy (design — no SQL)

Same expand pattern as Package 1, **properties only**:

1. `BEGIN`  
2. Preconditions: `companies` + ALODILA seed exist  
3. Add nullable `company_id uuid`  
4. Non-unique index on `company_id`  
5. Backfill NULL → ALODILA UUID  
6. Validate: zero NULLs; all values = ALODILA UUID  
7. FK `properties.company_id` → `companies(id)` (normal FK, not `NOT VALID`)  
8. `COMMIT`  

**Deferred:** `NOT NULL`, RLS company predicates, app defaults.

### 5. Backfill strategy

- Target: every `public.properties` row where `company_id IS NULL`  
- Value: `a1000000-a10d-4000-8000-000000000001`  
- Include soft-deleted properties (preserve history under ALODILA)  
- Do **not** change `id`, `owner_id`, `owner_crm_id`, names, meters counts, or any other column  
- Live scale expectation: ~2 rows → trivial  

### 6. Validation strategy

| Check | Success | Failure |
|-------|---------|---------|
| Column exists, nullable | Catalog OK | Wrong type / premature NOT NULL |
| Index present | `properties_company_id_idx` (name TBD at author time) | Missing |
| NULL count | `0` | Any NULL → abort before FK / fail gate |
| Value check | All rows = ALODILA UUID | Any other UUID |
| FK present | `properties_company_id_fkey` → `companies(id)` | Missing |
| Scope | No new `company_id` on units/contracts/… | Leak → investigate |
| Baseline | Row count unchanged vs pre-package snapshot | Unexpected drift |

**GO to smoke** only if all validation checks pass.

### 7. Rollback strategy (Package 2 only)

**Trigger:** validation fail, smoke fail, or abort before Package 3.

**Steps (order):**
1. Drop FK `properties_company_id_fkey`  
2. Drop index on `properties.company_id`  
3. Drop column `properties.company_id`  

**Does not:** delete properties; touch Package 1 columns; touch child tables.

### 8. Smoke-test checklist — **SIGNED OFF** 2026-08-04

Manual smoke completed and passed after Package 2 execute.

### 9–11. Historical plan notes

Lock/risk estimates from planning held; production execute matched plan. Package 2 closed.

---

*Sprint 3 DDL COMPLETE (Packages 1–5 applied). Package 5 smoke pending. Sprint 4 Stream C (app read filters) IMPLEMENTED; soft RLS not done.*
