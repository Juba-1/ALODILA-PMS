# Sprint 2 — Technical Design: Super Admin Platform Administration

**Status:** APPROVED — implementation gated by Phase blueprints (2A next)  
**Prerequisite:** Sprint 1 COMPLETED (`public.companies` live; ALODILA seed present)  
**Architecture:** Platform Architecture v1  
**Production rule:** ALODILA PMS business data and logic remain fully operational and unchanged.

---

## 0. Sprint identity note (plan reorder)

In Platform Architecture v1, “Sprint 2” originally meant **additive `company_id` foundation**.

This document **redefines Sprint 2** as:

> **Build the Platform Administration control plane on top of `public.companies` — before any `company_id` is introduced on PMS tables.**

Former Architecture “Sprint 2 — Additive foundation” is deferred and renumbered in the architecture document as a later sprint (after Platform Admin exists). Rationale: operators need a safe control plane to create/manage companies *before* tenancy columns touch production portfolio tables.

---

## 1. Objective & constraints

### 1.1 Objective

Design (then later implement, only after approval) a **Platform Super Admin** area that manages SaaS companies using the existing `public.companies` table.

### 1.2 Hard constraints (this sprint family)

| Rule | Meaning |
|------|---------|
| Use existing `public.companies` | No new tenancy tables required for MVP Platform Admin |
| No PMS table changes | Do not alter `properties`, `units`, `contracts`, etc. |
| No `company_id` anywhere | No additive FK columns on business tables |
| No RLS modifications | Do not edit policies on `companies` or any other table |
| No Auth modifications | Do not change Auth users, JWT claims, `app_metadata`, or login flows *yet* |
| No production business logic changes | PMS modules (`lib/db/*` for portfolio) stay behavior-identical |
| Soft delete only | Never hard-delete company rows |
| Design first | This document is planning only |

### 1.3 Success criteria (when implementation is later approved)

1. Super Admin can open a dedicated Platform UI (separate from Company Ops / Owner Portal).
2. Full company lifecycle via UI: list, create, edit, suspend, activate, soft-delete, detail view.
3. Subscription and login-binding appear as **placeholders only** (no billing, no Auth binding writes).
4. Non–super-admin sessions cannot use Platform routes (client gate using existing role helpers; DB already enforces via existing `is_super_admin()` RLS).
5. ALODILA company ops and owner portal continue unchanged.
6. Creating a second company row does **not** isolate PMS data yet (explicit: no tenancy on business tables).

### 1.4 Explicit non-goals

- Binding `auth_user_id` to Auth users (placeholder UI only).
- Provisioning Auth users / passwords.
- Billing, Stripe, invoices for SaaS plans.
- Assume-company / break-glass into a company’s PMS.
- `company_id` backfill or composite uniqueness.
- Changing `is_super_admin()` SQL definition or claim normalization (tracked as a **dependency risk**, not this sprint’s work).
- Contaminant table cleanup (`organizations`, etc.).

---

## 2. Complete technical design

### 2.1 Product definition

**Platform Administration** is the SaaS control plane:

- Audience: Platform Super Admin only.
- Data surface: `public.companies` exclusively.
- Relationship to PMS: **none yet** — companies are registry entries; portfolio data remains global/legacy until a later tenancy sprint.

### 2.2 Feature set

| # | Feature | Behavior |
|---|---------|----------|
| 1 | Super Admin Dashboard | Counts & status breakdown from `companies`; shortcuts to list/create; warnings that tenancy is not live |
| 2 | Companies Management | Filterable/sortable table: name, slug, status, deleted flag, created/updated, login-binding state (null/placeholder) |
| 3 | Create Company | Form: name, slug, optional notes; default `status = active` (or `provisioning` if chosen); `auth_user_id = null` |
| 4 | Edit Company | Edit name, slug (with collision handling), notes; status editable via dedicated actions preferred |
| 5 | Suspend / Activate | Status transitions: `active ↔ suspended`; `provisioning → active` allowed; block invalid transitions |
| 6 | Soft Delete Company | Set `is_deleted = true`; optionally force `status = suspended`; restore = set `is_deleted = false` |
| 7 | Company Details | Read-only + actions page: identity, status, timestamps, notes, placeholder subscription panel, placeholder login binding panel |
| 8 | Subscription placeholders | UI cards: plan = “—”, billing status = “Not configured”, CTA disabled / “Coming later” |
| 9 | Login binding placeholders | Show `auth_user_id` if any, else “Unbound”; Bind / Rotate / Unbind buttons disabled with tooltip “Auth binding deferred” |

### 2.3 Status model (reuse existing CHECK)

Allowed values already in DB: `active` | `suspended` | `provisioning`.

Recommended transitions (application-enforced; no SQL change):

```
provisioning ──► active
active       ──► suspended
suspended    ──► active
any (except hard rules) ──► soft-delete (is_deleted=true)
soft-deleted ──► restore (is_deleted=false) [optional product decision]
```

**ALODILA protection (product rule):**

- Soft-delete and suspend of `slug = alodila` (or fixed UUID `a1000000-a10d-4000-8000-000000000001`) require an **extra confirmation** (typed slug) in UI.
- Prefer never soft-deleting ALODILA in normal ops; document as protected company.
- Slug rename of `alodila` should be **blocked** in MVP Platform Admin (preserve stable seed identity).

### 2.4 Access model (without Auth changes)

**Database (already live from Sprint 1):**

- RLS on `companies`: SELECT / INSERT / UPDATE only when `public.is_super_admin()` is true.
- No DELETE policy → soft-delete via UPDATE only.

**Application (design for implementation):**

- Reuse existing client helper `isSuperAdminUser(user)` (`role === 'super_admin'` from metadata).
- Platform routes mount only when that helper is true.
- Owner portal and staff trees remain as today for non–super-admin users.
- **Interim persona split (critical):** Until Auth claim normalization, a user who is both “staff operator” and `super_admin` may need dual access. Design choice for this sprint:

  **Recommended interim:** Super Admin users are routed preferentially to **Platform** (`/platform/*`). A clear link “Open ALODILA Ops (legacy)” returns them to the existing staff dashboard **without** changing Auth. This preserves ALODILA day-to-day ops without Auth work.

  Alternative (reject for now): force Super Admin only on Platform and lock them out of PMS — too risky for production ALODILA.

### 2.5 Claim naming gap (document only; no Auth change)

| Layer | Current | Architecture target |
|-------|---------|---------------------|
| App helper | `role === 'super_admin'` | May later become `platform_super_admin` |
| SQL RLS | `is_super_admin()` | Must stay compatible with whoever can manage companies |

**This sprint does not normalize claims.** Implementation must use the **existing** app + SQL definitions so Platform Admin works with today’s Super Admin accounts. Claim rename is a separate gated sprint.

### 2.6 Soft-delete semantics

- List default: hide `is_deleted = true` (toggle “Show deleted”).
- Soft-deleted companies: no create-collision on slug if UNIQUE(slug) remains global — **risk**: soft-deleted slug still blocks reuse. Call out in risks; remediation (partial unique index) is **SQL** and therefore **out of scope** unless separately approved later.
- Restore: update `is_deleted = false` only if product allows.

### 2.7 Validation rules (client + service)

| Field | Rules |
|-------|--------|
| `name` | Required; trim; non-empty |
| `slug` | Required; lowercase kebab `^[a-z0-9]+(?:-[a-z0-9]+)*$`; unique |
| `status` | Enum only |
| `notes` | Optional; max length e.g. 2000 chars (app-side) |
| `auth_user_id` | Never written by Platform Admin forms in this sprint |

---

## 3. UI architecture

### 3.1 Information architecture

```
/platform                          → Super Admin Dashboard
/platform/companies                → Companies Management (list)
/platform/companies/new            → Create Company
/platform/companies/:id            → Company Details
/platform/companies/:id/edit       → Edit Company
```

Optional (same pages via modals instead of `/edit` and `/new` routes): acceptable if consistent with existing Modal patterns; routes preferred for deep-linking and RTL page titles.

### 3.2 Layout

New layout shell: **`PlatformLayout`** (sibling of `DashboardLayout` / `OwnerLayout`):

- Brand: “ALODILA Platform” / control-plane wording (distinct from company PMS brand block).
- Nav: Dashboard · Companies · (disabled: Subscriptions, Audit — placeholders).
- Escape hatch: “ALODILA Ops” → `/` (legacy staff).
- Sign out: existing supabase signOut.
- No AI chatbot in Platform MVP (reduce noise; optional later).
- i18n: Arabic-first, English toggle — reuse existing language infrastructure.

### 3.3 Page compositions

**Dashboard**

- KPI tiles: total companies, active, suspended, provisioning, deleted (if shown).
- Recent companies (last 5 by `updated_at`).
- Banner: “Tenancy not enforced on PMS data yet.”
- Primary CTA: Create Company.

**Companies list**

- Search: name / slug.
- Filters: status, include deleted.
- Columns: name, slug, status badge, login bound? (yes/no), updated_at, actions.
- Row actions: View · Edit · Suspend/Activate · Soft-delete · Restore (if deleted).

**Create / Edit forms**

- Fields: name, slug (slug auto-suggest from name on create only; editable until save), notes.
- Status on create: default `active` or `provisioning` (product pick; recommend `provisioning` for non-ALODILA to signal “not ready”, `active` for simplicity in MVP — **recommend `active`** until Auth binding exists).

**Company Details**

- Header: name + status badge + soft-delete badge.
- Sections: Identity · Lifecycle actions · **Subscription (placeholder)** · **Login binding (placeholder)** · Internal notes · Audit timestamps.
- Danger zone: Soft-delete (and Restore).

### 3.4 Routing integration (conceptual)

Extend `App.jsx` branch logic **after** session exists:

1. Owner portal user → owner routes (unchanged).
2. Else if Super Admin → Platform routes **or** allow both Platform + staff via path prefix (recommended):
   - Paths under `/platform/*` → `PlatformLayout`.
   - Other staff paths → existing `DashboardLayout`.
3. Else → staff only (unchanged).

Guard: visiting `/platform/*` without Super Admin → redirect to `/` with toast “Unauthorized”.

### 3.5 UX principles

- Reuse existing UI primitives (`Button`, `Input`, `Select`, `Modal`, `Card`, toast).
- Confirm destructive / suspension actions with modal.
- Optimistic UI optional; prefer await + toast for clarity.
- Empty state when only ALODILA exists: still show the one seed row.

---

## 4. File structure (proposed)

Planning only — files to be created in a future implementation sprint:

```
src/
  components/
    platform/
      PlatformLayout.jsx
      PlatformNav.jsx
      CompanyStatusBadge.jsx
      ConfirmCompanyActionModal.jsx
      PlaceholderPanel.jsx          # subscription / login binding shells
  pages/
    platform/
      PlatformDashboard.jsx
      CompaniesList.jsx
      CompanyCreate.jsx
      CompanyEdit.jsx
      CompanyDetail.jsx
  lib/
    db/
      companies.js                 # ONLY public.companies access
    platform/
      companyValidators.js         # slug/name/status rules
      companyTransitions.js        # suspend/activate/soft-delete rules
      protectedCompanies.js        # alodila UUID/slug guards
  i18n/locales/
    phase2.ar.js / phase2.en.js    # add platform.* keys (or dedicated platform locale module)
```

**Do not modify** (behavior) in this workstream:

- `src/lib/db/contracts.js`, `properties.js`, `invoices.js`, … (PMS)
- Auth provisioning paths
- Owner portal modules

**Allowed touch points (implementation phase):**

- `App.jsx` — route branch for `/platform`
- `roles.js` — optional thin `canAccessPlatform(user)` alias to `isSuperAdminUser` (no claim change)
- i18n locale files — new strings only

---

## 5. Backend architecture

### 5.1 Backend shape

ALODILA-PMS remains a **Vite/React SPA + Supabase**. No new Node API server for Platform Admin MVP.

```
Platform UI
    │
    ▼
lib/db/companies.js  (Supabase JS client)
    │
    ▼
PostgREST → public.companies
    │
    ▼
Postgres RLS (existing is_super_admin())
```

### 5.2 Why no Edge Functions yet

- CRUD maps 1:1 to table columns already protected by RLS.
- Auth binding / user provisioning (future) **will** need service-role Edge Functions — out of scope now; placeholders acknowledge that gap.

### 5.3 Trust boundaries

| Layer | Responsibility |
|-------|----------------|
| RLS | Authoritative: only Super Admin can read/write companies |
| App route guard | UX + accidental navigation prevention; not sole security |
| Validators | Prevent invalid CHECK/UNIQUE errors; better UX |
| Protected company rules | Product safety for ALODILA seed |

---

## 6. Database usage

### 6.1 Tables

| Table | Usage |
|-------|--------|
| `public.companies` | **Only** table read/written by Platform Admin |
| All other `public.*` PMS tables | **Not queried** by Platform modules |
| `auth.users` | **Not written**; may later display email via admin API — **not in this sprint** |

### 6.2 Operations mapping

| UI action | DB operation | Notes |
|-----------|--------------|-------|
| List / search | `SELECT` | Filter `is_deleted`, `status`; order by `updated_at` |
| Dashboard counts | `SELECT` + client aggregate or multiple count queries | Prefer simple client-side aggregate for small N |
| Create | `INSERT` | `auth_user_id` null; rely on defaults |
| Edit | `UPDATE` | name, slug, notes only (status via dedicated actions) |
| Suspend / Activate | `UPDATE status` | Transition rules in app |
| Soft delete | `UPDATE is_deleted = true` | Optionally set status suspended |
| Restore | `UPDATE is_deleted = false` | Optional |
| Bind login | — | Placeholder; no write |
| Subscription | — | Placeholder; no table |

### 6.3 Columns used

`id`, `created_at`, `updated_at`, `is_deleted`, `name`, `slug`, `status`, `auth_user_id` (read-only display), `notes`.

### 6.4 Explicit non-usage

- No migrations in this planning sprint.
- No new columns for “plan”, “billing_status” yet — placeholders are **UI-only** until a subscriptions schema sprint.
- If product later needs plan fields, that is a **separate additive migration** (not this document’s SQL).

---

## 7. API / service layer design

### 7.1 Module: `lib/db/companies.js`

Conceptual API (names illustrative):

| Function | Purpose |
|----------|---------|
| `listCompanies({ q, status, includeDeleted })` | Filtered list |
| `getCompany(id)` | Detail |
| `createCompany({ name, slug, notes, status? })` | Insert |
| `updateCompany(id, { name, slug, notes })` | Edit identity/notes |
| `setCompanyStatus(id, status)` | Suspend / activate / provisioning |
| `softDeleteCompany(id)` | `is_deleted = true` |
| `restoreCompany(id)` | `is_deleted = false` |
| `getCompanyStats()` | Optional aggregates for dashboard |

### 7.2 Module: `lib/platform/*`

- Pure functions: validation, transition matrix, ALODILA protection checks.
- Called **before** DB writes; DB constraints remain last line of defense.

### 7.3 Error handling

Map PostgREST / Postgres errors:

| Condition | UX |
|-----------|-----|
| Unique slug violation | “Slug already in use” |
| CHECK slug/status | “Invalid slug/status” |
| RLS rejection (non–super-admin) | “Unauthorized” |
| Network | Generic retry toast |

### 7.4 No service-role keys in the browser

All Platform Admin calls use the user’s JWT. Service role remains server-only for future Auth binding.

---

## 8. Sprint breakdown (implementation phases)

Approve design first; then execute phases below **without** advancing to `company_id` work.

### Phase 2A — Shell & read path (smallest shippable) — **IMPLEMENTED**

- `PlatformLayout` + routes `/platform`, `/platform/companies`, `/platform/companies/:id`
- `listCompanies` / `getCompany` / dashboard stats
- Read-only list + detail
- Route guard via `isSuperAdminUser`
- Escape hatch to ALODILA Ops
- **Exit:** Super Admin can view ALODILA seed company; others redirected
- Code: `src/platform/**` · wiring: `App.jsx` only
- Blueprint: `docs/SPRINT2A_IMPLEMENTATION_BLUEPRINT.md`

### Phase 2B — Write path (lifecycle) — **IMPLEMENTED**

- Create, Edit
- Suspend / Activate
- Soft Delete / Restore (thin extension of soft-delete)
- Confirm modals + ALODILA protection
- Extension seams: audit / flags / subscription (stubs)
- **Exit:** Full lifecycle on `companies` only; PMS unchanged
- Blueprint: `docs/SPRINT2B_IMPLEMENTATION_BLUEPRINT.md`
- Code: `src/platform/**` (App.jsx unchanged in 2B)

### Phase 2C — Placeholders & polish — **IMPLEMENTED** (Sprint 2 complete)

- Login binding placeholder panel (disabled Bind; read-only `auth_user_id`)
- Subscription placeholder panel (status / limits / billing stubs)
- Company modules disabled switches (feature-flag stub)
- Platform information read-only panel
- **Exit:** Platform Admin UX complete for registry management + future seams
- Code: `src/platform/components/panels/**` + Company Detail composition

### Phase 2D — (Optional, still no Auth/SQL) Hardening

- Client audit log stub (local/console only) — or skip until real audit table approved
- Feature flag `VITE_PLATFORM_ADMIN_ENABLED` for emergency hide
- **Exit:** Safe to leave enabled in production for Super Admin accounts

**Stop line:** Do **not** start tenancy/`company_id` until Platform Admin is approved as complete and a new directive is issued.

---

## 9. Risk analysis

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Super Admin claim mismatch (`super_admin` vs SQL `is_super_admin()`) → empty list / write failures | High | Medium | Pre-implement smoke: logged-in Super Admin `SELECT` on `companies` via client; fix claims in a **separate Auth sprint** if needed — do not patch RLS here |
| Soft-deleted slug blocks reuse (UNIQUE on `slug`) | Medium | High | Document; UI message; future partial unique index (requires approved SQL later) |
| Accidental suspend/delete of ALODILA | High | Low | Typed confirmation; block slug rename; optional env deny-list |
| Building Platform UI creates false sense of multi-tenancy | High | High | Persistent banner: “PMS data is not company-scoped yet” |
| Routing Super Admin away from staff console breaks daily ops | High | Medium | Dual-access design: `/platform` + legacy `/` |
| Scope creep into Auth binding / billing | Medium | High | Placeholders only; PR checklist forbids `auth_user_id` writes |
| Non–super-admin discovers `/platform` URLs | Low | Medium | Client redirect + RLS deny |
| Contaminant / parallel schemas confuse admins | Low | Medium | Platform UI never lists non-`companies` tenancy tables |
| Implementing without design approval | Medium | — | This document is the gate |

### 9.1 Residual accepted risks

- No true SaaS isolation until a later tenancy sprint.
- Login binding remains unbound for all companies including ALODILA.
- Claim normalization debt remains open.

### 9.2 Rollback (implementation)

- Feature flag off or remove `/platform` routes → app returns to pre-Platform behavior.
- Company rows created during Platform Admin remain in `companies` (harmless; no FK from PMS).
- Soft-deleted rows can be restored via SQL/UI; no PMS impact.

---

## 10. Testing & acceptance (for later implementation)

### 10.1 Manual acceptance

- [ ] Super Admin opens `/platform` and sees dashboard.
- [ ] ALODILA seed visible (`slug=alodila`, fixed UUID).
- [ ] Create company → appears in list; row only in `companies`.
- [ ] Edit name/notes; slug change works when unique.
- [ ] Suspend → Activate round-trip.
- [ ] Soft-delete hides from default list; restore works (if enabled).
- [ ] Placeholders visible; no Auth/billing side effects.
- [ ] Owner portal user cannot access `/platform`.
- [ ] Staff non–super-admin cannot access `/platform`.
- [ ] Staff PMS flows (contracts, finance, properties) unchanged.
- [ ] No new SQL migrations applied as part of this work.

### 10.2 Explicit verification SQL (operators only; not authored here)

Operators may run read-only checks against `companies` row counts before/after UI tests. **No migration scripts** ship with this design.

---

## 11. Dependencies & sequencing

```
Sprint 1 companies table          ✅ DONE
        │
        ▼
Sprint 2 Platform Admin (this)    ← YOU ARE HERE (design)
        │
        ▼
Auth claim normalization          (separate; before multi-company go-live)
        │
        ▼
company_id additive / backfill    (former Arch Sprint 2 — deferred)
        │
        ▼
Login binding + provisioning      (uses placeholders’ real implementation)
        │
        ▼
Subscriptions schema + billing
```

---

## 12. Approval gate

| Item | Status |
|------|--------|
| Technical design (this doc) | Awaiting approval |
| UI architecture | Awaiting approval |
| File structure | Awaiting approval |
| Backend / service design | Awaiting approval |
| Sprint breakdown (2A–2D) | Awaiting approval |
| Risk analysis | Awaiting approval |
| Code | **Not generated** |
| SQL | **Not generated** |

**Next step after your approval:** implement Phase 2A only (or as you direct). Do not introduce `company_id`. Do not modify Auth or RLS unless you issue a new critical directive.

---

*End of Sprint 2 Platform Admin Technical Design — PLANNING ONLY*
