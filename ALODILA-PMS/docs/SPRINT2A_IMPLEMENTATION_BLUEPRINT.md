# Sprint 2A — Implementation Blueprint (Pre-Code)

**Status:** APPROVED — Phase 2A implemented  
**Phase:** 2A — Shell & read path only  
**Parent design:** `docs/SPRINT2_PLATFORM_ADMIN_DESIGN.md` (approved)  
**Code:** Not generated yet  
**SQL / schema / Auth / PMS business logic:** Forbidden

---

## 0. Phase 2A scope lock

### In scope

| Item | Notes |
|------|--------|
| Platform shell layout | Isolated module |
| Routes `/platform`, `/platform/companies`, `/platform/companies/:id` | Read-only |
| Super Admin route guard | Existing `isSuperAdminUser` only — no Auth changes |
| Read services for `public.companies` | `list` / `get` / dashboard aggregate |
| Escape hatch to ALODILA Ops (`/`) | Link only |
| Dual access for Super Admin | `/platform/*` + existing staff tree |

### Out of scope (2B+)

- Create / Edit / Suspend / Activate / Soft-delete
- Subscription & login-binding placeholders (2C)
- Feature flags, audit stubs (2D)
- Any write to `companies`
- Any PMS page or `lib/db/*` PMS module changes

---

## 1. Isolation architecture (non-negotiable)

### 1.1 Module zones

```
┌─────────────────────────────────────────────────────────────┐
│  COMPOSITION ROOT (only place that may know both worlds)     │
│  src/App.jsx                                                 │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│  PLATFORM ZONE            │   │  PMS ZONE                     │
│  src/platform/**          │   │  src/pages/** (non-platform)  │
│                           │   │  src/components/Dashboard*    │
│  May import SHARED only   │   │  src/components/Owner*        │
│  Must NOT import PMS      │   │  src/lib/db/* (PMS tables)    │
│                           │   │  src/lib/finance|ai|…         │
│                           │   │  Must NOT import PLATFORM      │
└─────────────┬─────────────┘   └───────────────┬───────────────┘
              │                                 │
              └─────────────┬───────────────────┘
                            ▼
              ┌─────────────────────────────┐
              │  SHARED ZONE                │
              │  src/components/ui/**       │
              │  src/components/toast/**    │
              │  src/lib/supabase/**       │
              │  src/lib/auth/roles.js      │
              │  src/lib/brand/**           │
              │  src/i18n/** (keys only)    │
              │  src/components/Language*   │
              │  src/components/Error*      │
              │  src/components/HtmlLang*   │
              └─────────────────────────────┘
```

### 1.2 Removal guarantee

Deleting `src/platform/` entirely + removing the Platform branch/imports from `App.jsx` must leave PMS fully functional. No PMS file may statically import from `src/platform/**`.

### 1.3 Why companies service is NOT under `src/lib/db/`

`src/lib/db/` today is PMS data access. Putting `companies.js` there would:

- Encourage accidental PMS ↔ Platform coupling
- Blur “shared” vs “platform-owned” data access

**Rule:** Platform data access lives at `src/platform/services/companies.js` only.

---

## 2. Complete file tree (Phase 2A)

New files only (unless noted). No SQL. No schema.

```
src/
  platform/                              # PLATFORM ZONE (delete-safe)
    index.js                             # public barrel: routes element + canAccess helper re-export
    PlatformRoutes.jsx                   # <Routes> subtree for /platform/* (or route element tree)
    layout/
      PlatformLayout.jsx                 # shell: nav + Outlet
      PlatformNav.jsx                    # platform nav links + Ops escape hatch
    pages/
      PlatformDashboard.jsx              # /platform
      CompaniesList.jsx                  # /platform/companies
      CompanyDetail.jsx                  # /platform/companies/:id
    components/
      CompanyStatusBadge.jsx             # status chip (active/suspended/provisioning)
      CompaniesTable.jsx                 # presentational table for list
      PlatformPageHeader.jsx             # title + optional actions slot
      PlatformTenancyBanner.jsx          # “tenancy not enforced” notice
      PlatformGuard.jsx                  # redirect non–super-admin away from /platform
    services/
      companies.js                       # READ-ONLY: listCompanies, getCompany, getCompanyStats
    hooks/
      useCompaniesList.js                # list fetch + local filter state
      useCompanyDetail.js                # detail fetch by id
      useCompanyStats.js                 # dashboard aggregates
    lib/
      companyFormat.js                   # display helpers (dates, bound?, labels) — no PMS
      constants.js                       # ALODILA_COMPANY_ID, status enums (read-side)
    i18n/
      platform.ar.js                     # Arabic strings for platform.* keys
      platform.en.js                     # English strings
      registerPlatformI18n.js            # registers namespaces/keys into shared i18n (called once from platform index)

  App.jsx                                # TOUCH: wire PlatformRoutes + guard; do not move PMS logic into platform
```

### Explicitly NOT created in 2A

```
src/platform/pages/CompanyCreate.jsx     # 2B
src/platform/pages/CompanyEdit.jsx       # 2B
src/platform/services/companiesWrite.js  # 2B
src/platform/lib/companyTransitions.js   # 2B
src/platform/lib/companyValidators.js    # 2B (writes)
src/platform/components/Confirm*.jsx     # 2B
src/platform/components/Placeholder*.jsx # 2C
```

### Files that must remain untouched (behavior)

| Area | Examples |
|------|----------|
| PMS pages | `src/pages/properties/**`, `contracts/**`, `finance/**`, … |
| PMS db | `src/lib/db/contracts.js`, `properties.js`, … |
| Owner | `src/pages/owner/**`, `OwnerLayout.jsx` |
| Auth flows | `DevLogin.jsx`, Auth claim writers (none exist for platform) |
| Roles implementation | May **read** `isSuperAdminUser`; must **not** change claim semantics in 2A |

**Allowed shared read-only dependencies** (import into Platform): listed in §8–§10.

**i18n registration:** Prefer Platform-owned locale modules merged via a one-line register call from `platform/index.js` (or `PlatformRoutes` mount). Avoid scattering `platform.*` keys into PMS-specific domain files if avoidable; if the existing i18n pattern requires editing `phase2.ar.js` / `phase2.en.js` / `ar.json` / `en.json`, treat those edits as **shared key additions only** (no PMS string changes).

---

## 3. Routes

### 3.1 Route table (2A)

| Path | Element | Auth |
|------|---------|------|
| `/platform` | `PlatformDashboard` | Super Admin |
| `/platform/companies` | `CompaniesList` | Super Admin |
| `/platform/companies/:id` | `CompanyDetail` | Super Admin |
| `/platform/*` (unknown) | `Navigate` → `/platform` | Super Admin |

### 3.2 Composition in `App.jsx` (conceptual)

Persona order after session exists:

1. **Owner portal** → existing owner routes (unchanged).  
2. **Everyone else (staff + super admin)** → **combined** route tree:
   - `/platform/*` → `PlatformGuard` → `PlatformLayout` → platform pages  
   - existing `/` staff tree → `DashboardLayout` → PMS pages (unchanged)

Owner users never receive Platform routes (same as today: catch-all → `/owner`).

Non–super-admin staff hitting `/platform/*` → `PlatformGuard` redirects to `/` (no Platform UI flash preferred).

### 3.3 Route element sketch (not code delivery)

```
<Route path="/platform" element={<PlatformGuard><PlatformLayout /></PlatformGuard>}>
  <Route index element={<PlatformDashboard />} />
  <Route path="companies" element={<CompaniesList />} />
  <Route path="companies/:id" element={<CompanyDetail />} />
  <Route path="*" element={<Navigate to="/platform" replace />} />
</Route>
<!-- existing DashboardLayout routes unchanged -->
```

Preferred packaging: `PlatformRoutes` exports the `/platform` `Route` node(s) so `App.jsx` imports one symbol from `src/platform` only.

### 3.4 Deep links

- Detail URL: `/platform/companies/:id` where `:id` is UUID.  
- Invalid UUID / not found: page-level empty/error state (not a PMS redirect).

---

## 4. Components

### 4.1 Layout & chrome

| Component | Responsibility | Zone |
|-----------|----------------|------|
| `PlatformLayout` | Header, nav, `<Outlet />`, sign-out via shared supabase client | Platform |
| `PlatformNav` | Links: Dashboard, Companies; link “ALODILA Ops” → `/` | Platform |
| `PlatformGuard` | If `!isSuperAdminUser(session.user)` → `<Navigate to="/" />` | Platform |
| `PlatformPageHeader` | Title, subtitle, optional right slot | Platform |
| `PlatformTenancyBanner` | Static warning: PMS not company-scoped yet | Platform |

### 4.2 Feature components (2A)

| Component | Responsibility |
|-----------|----------------|
| `CompanyStatusBadge` | Map `status` → visual badge |
| `CompaniesTable` | Columns: name, slug, status, login bound?, updated_at, link to detail |
| `PlatformDashboard` (page) | Stats cards + recent companies + CTA link to list (Create button deferred/disabled or hidden in 2A) |
| `CompaniesList` (page) | Search/filter (client or query param) + table |
| `CompanyDetail` (page) | Read-only identity fields; no write actions in 2A |

### 4.3 Shared UI reused (not copied)

From `src/components/ui/`: `Button`, `Input`, `Card`, `EmptyState`, `Select` (if filters need it), `cn`.

From shared chrome: `LanguageToggle`, toast via existing `ToastProvider` (errors only).

**Do not reuse:** `DashboardLayout`, `OwnerLayout`, `AIChatbot`, `AdvancedFilterBar`, PMS-specific widgets (`OwnerRoiWidget`, finance timelines, etc.).

---

## 5. Services

### 5.1 `src/platform/services/companies.js` (READ-ONLY)

| Export | Behavior |
|--------|----------|
| `listCompanies({ q?, status?, includeDeleted? })` | `SELECT` from `companies`; default `is_deleted = false`; optional ilike on name/slug; order `updated_at desc` |
| `getCompany(id)` | Single row by `id` |
| `getCompanyStats()` | Derive counts from a list fetch or lightweight selects: total, active, suspended, provisioning, deleted |

**2A forbids:** `insert`, `update`, `delete`, any mutation helper.

### 5.2 Client usage

- Import `supabase` / `hasSupabaseConfig` from **shared** `src/lib/supabase/client.js` only.
- Return `{ data, error }` style consistent with existing PMS services (shape mirroring is fine; **do not import** PMS service modules to “reuse” helpers).

### 5.3 Error mapping (read path)

| Condition | UI |
|-----------|-----|
| RLS / permission | Toast or inline “Unauthorized / cannot load companies” |
| Network | Retry-friendly message |
| Not found (detail) | Empty state on detail page |

---

## 6. Hooks

All hooks live under `src/platform/hooks/` and may only import Platform services + React + react-router.

| Hook | State | Effects |
|------|-------|---------|
| `useCompanyStats()` | `{ stats, loading, error, reload }` | Load on mount |
| `useCompaniesList({ q, status, includeDeleted })` | `{ rows, loading, error, reload }` + local control state for filters | Reload when filters change |
| `useCompanyDetail(id)` | `{ company, loading, error, reload }` | Load when `id` changes |

**No global Platform store** in 2A. No React Context required beyond what App already provides (session stays in `App`; guard receives user via `useOutletContext` **or** re-reads session from supabase — pick one):

**Recommended for 2A:** `PlatformGuard` / layout call `supabase.auth.getSession()` or accept `user` from a thin **shared** pattern already used — simplest: pass nothing and use `isSuperAdminUser` after `supabase.auth.getUser()` inside guard, **or** lift `session.user` through React Router outlet context from `App` without creating a Platform-specific global store.

Preferred clean approach:

- `App` already has `session`.
- Pass `user={session.user}` into `PlatformGuard` as prop from the route element factory in `App` / `PlatformRoutes`.

No Redux, Zustand, or new app-wide Context for companies data.

---

## 7. State management

| Concern | Approach |
|---------|----------|
| Auth session | Existing `App.jsx` state (unchanged semantics) |
| Platform list/detail/stats | Local hook state only |
| Filters (q/status/deleted) | Local component/hook state; optional URL search params later (not required in 2A) |
| Toasts | Existing shared ToastProvider |
| i18n language | Existing shared i18n |

**No** shared cache between Platform and PMS.  
**No** writing company records into PMS dashboards.

---

## 8. Navigation flow

```
Login (unchanged)
    │
    ├─ owner role ──────────────► /owner/**          (unchanged)
    │
    └─ staff / super_admin ─────► staff tree + platform tree
            │
            ├─ /  /properties /contracts …  ► PMS DashboardLayout
            │
            └─ /platform/**
                    │
                    ├─ PlatformGuard
                    │     ├─ not super_admin ► redirect /
                    │     └─ super_admin ▼
                    │
                    └─ PlatformLayout
                          ├─ /platform                 ► Dashboard (stats + recent)
                          ├─ /platform/companies       ► List → click row
                          └─ /platform/companies/:id   ► Detail (read-only)
                                │
                                └─ Nav: “ALODILA Ops” ► /
```

### Escape hatch

- Label: e.g. “ALODILA Ops” / “فتح نظام العضيلة”
- Target: `/` (PMS home)
- Does not change Auth or claims

### Entry to Platform (2A)

- Direct URL `/platform` (primary).
- Optional later (not required): link from PMS nav for super_admin only — **if added, must live in composition/shared guard, not by importing Platform pages into DashboardLayout**. Prefer a tiny shared helper `canAccessPlatform(user)` in `roles.js` and a plain `<Link to="/platform">` in `DashboardLayout` **only if approved**; default 2A = **no PMS nav change** to maximize isolation (Super Admin bookmarks `/platform`).

**Blueprint default for 2A:** **No edits to `DashboardLayout.jsx`.** Entry = URL only + optional post-login redirect later (out of scope).

---

## 9. Shared vs Platform-only modules

### 9.1 Shared (Platform may import)

| Module | Why shared |
|--------|------------|
| `src/lib/supabase/client.js` | Single Supabase client |
| `src/lib/supabase/authErrors.js` | Optional ignore helpers |
| `src/lib/auth/roles.js` | `isSuperAdminUser` |
| `src/components/ui/**` | Design system primitives |
| `src/components/toast/**` | Toasts |
| `src/components/LanguageToggle.jsx` | Language |
| `src/components/ErrorBoundary.jsx` | Already wraps app |
| `src/components/HtmlLangDirSync.jsx` | App-level |
| `src/lib/brand/logoUrl.js` | Logo asset URL |
| `src/i18n/config.js` | i18n instance (register platform strings) |

### 9.2 Platform-only (PMS must never import)

| Path | Contents |
|------|----------|
| `src/platform/**` | Entire tree |

### 9.3 PMS-only (Platform must never import)

| Path | Examples |
|------|----------|
| `src/pages/properties|contracts|finance|tenants|owners|units|maintenance|reports|import|dashboard|owner/**` | All PMS/owner pages |
| `src/components/DashboardLayout.jsx` | Staff chrome |
| `src/components/OwnerLayout.jsx` | Owner chrome |
| `src/components/AIChatbot.jsx` | PMS AI |
| `src/lib/db/**` | All current db modules |
| `src/lib/finance/**`, `src/lib/ai/**`, `src/lib/analytics/**` | Domain logic |
| `src/lib/auth/ownerScope.js` | Owner scoping |

### 9.4 Composition-only

| File | Role |
|------|------|
| `src/App.jsx` | Imports Platform barrel + PMS routes; sole bridge |

---

## 10. Dependency diagram

```
                    ┌──────────────┐
                    │   App.jsx    │
                    └──────┬───────┘
           ┌───────────────┼────────────────┐
           ▼               ▼                ▼
   PlatformRoutes    DashboardLayout    OwnerLayout
   (platform/)         (PMS)              (PMS)
           │
           ├─ PlatformGuard ──► roles.isSuperAdminUser (shared)
           ├─ PlatformLayout ─┬► ui/*, LanguageToggle, logoUrl (shared)
           │                  └► supabase.client (shared)
           ├─ PlatformDashboard ─┐
           ├─ CompaniesList ─────┼► hooks ──► services/companies.js
           └─ CompanyDetail ─────┘              │
                                                ▼
                                         supabase.from('companies')
                                                │
                                                ▼
                                         Postgres RLS (existing)
```

**Forbidden edges (must not exist):**

```
platform/**  ──X──►  pages/** (PMS)
platform/**  ──X──►  lib/db/**
platform/**  ──X──►  DashboardLayout / OwnerLayout / AI*
pages/**     ──X──►  platform/**
lib/db/**    ──X──►  platform/**
Dashboard*   ──X──►  platform/**
```

**Allowed edge:**

```
App.jsx  ──►  platform/index.js (PlatformRoutes)
App.jsx  ──►  PMS layouts/pages
```

---

## 11. Import boundaries (enforceable checklist)

### 11.1 Rules

1. **Platform files** may import only:
   - other `src/platform/**` modules
   - Shared list in §9.1
   - `react`, `react-router-dom`, `react-i18next` / project i18n
2. **PMS files** may not import `src/platform/**`.
3. **`src/lib/db/**`** may not import Platform; Platform may not import `src/lib/db/**`.
4. **`App.jsx`** is the only file that imports both Platform entry and PMS route modules.
5. **No re-export** of Platform symbols from shared modules (keeps removal clean).
6. **`roles.js`:** optional additive `canAccessPlatform = isSuperAdminUser` alias is allowed (shared, no Auth change). Do not change existing role strings.

### 11.2 PR / review checks (manual or lint later)

- Grep: `from ['\"].*platform` under `src/pages`, `src/lib/db`, `src/components/Dashboard`, `src/components/Owner` → must be empty.
- Grep inside `src/platform`: `lib/db/`, `pages/properties`, `DashboardLayout`, `contracts`, `invoices` → must be empty.
- Diff must not include SQL migrations or Auth metadata writers.

### 11.3 Barrel export surface

`src/platform/index.js` exports **only**:

- `PlatformRoutes` (or `PlatformRouteElement`)
- optionally `canAccessPlatform` re-export from roles (optional; prefer importing roles in App)

PMS must not deep-import Platform internals.

---

## 12. Phase 2A page responsibilities (detail)

### PlatformDashboard

- Call `useCompanyStats` + short `listCompanies` (limit recent 5).
- Show tenancy banner.
- Links: “View companies”, (Create hidden/disabled until 2B).

### CompaniesList

- Filters: text search, status, include deleted (default off).
- Table rows link to `/platform/companies/:id`.
- Empty state when zero rows (should not happen if ALODILA seed exists and RLS works).

### CompanyDetail

- Fields: name, slug, status, is_deleted, auth_user_id (display “Unbound” if null), notes, created_at, updated_at, id.
- No edit buttons in 2A (or disabled stubs labeled “Coming in 2B” — prefer **omit** to avoid false affordances).

---

## 13. App.jsx change budget (minimal)

| Change | Allowed |
|--------|---------|
| Import `PlatformRoutes` / guard wiring | Yes |
| Import `isSuperAdminUser` if needed for wiring | Yes |
| Alter owner branch | No |
| Alter PMS child routes list | No (only add sibling `/platform` route) |
| Change session loading | No |
| Change login | No |

Staff catch-all `path="*"` → `/` must **not** swallow `/platform` (define `/platform` route **before** or as sibling with higher specificity — React Router v6 ranks static segments correctly when declared as separate `Route path="/platform"`).

---

## 14. Testing checklist (2A acceptance)

- [ ] Super Admin opens `/platform` → dashboard loads; sees stats including ALODILA.
- [ ] `/platform/companies` lists ALODILA seed (`slug=alodila`).
- [ ] Detail page shows seed UUID and unbound login.
- [ ] Non–super-admin staff `/platform` → redirect `/`.
- [ ] Owner session cannot reach Platform (still owner-only tree).
- [ ] PMS routes unchanged in behavior.
- [ ] No writes issued to `companies` (network tab: GET only).
- [ ] Grep isolation rules pass.
- [ ] Mentally simulate deleting `src/platform` + App import → PMS still builds.

---

## 15. Implementation order (when coding is approved)

1. `platform/lib/constants.js` + `companyFormat.js`
2. `platform/services/companies.js` (read-only)
3. Hooks
4. Presentational components (badge, table, banner, header)
5. Pages
6. `PlatformNav` + `PlatformLayout` + `PlatformGuard`
7. `PlatformRoutes` + `index.js` + i18n register
8. Wire `App.jsx`
9. Manual acceptance §14

---

## 16. Approval gate

| Deliverable | Status |
|-------------|--------|
| File tree | Awaiting approval |
| Routes | Awaiting approval |
| Components | Awaiting approval |
| Services | Awaiting approval |
| Hooks | Awaiting approval |
| State management | Awaiting approval |
| Navigation flow | Awaiting approval |
| Shared vs Platform-only | Awaiting approval |
| Dependency diagram | Awaiting approval |
| Import boundaries | Awaiting approval |
| Application code | **Not started** |

**Default decisions embedded (confirm or amend):**

1. Platform lives entirely under `src/platform/**` (not under `pages/platform` + `lib/db/companies`).  
2. No `DashboardLayout` link in 2A (URL entry only).  
3. No React Context store for companies.  
4. Read-only service; zero mutations.  
5. `App.jsx` is the only bridge.

---

*End of Sprint 2A Implementation Blueprint — PRE-CODE*
