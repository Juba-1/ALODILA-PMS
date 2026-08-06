# Sprint 4 — Shared Tenancy Adapter (Design)

**Product:** ALODILA-PMS  
**Document type:** Application tenancy adapter blueprint (design only)  
**Status:** Stream A LANDED · Stream C wired for reads (`withCompanyEq` / `resolveReadScope` in `src/lib/db/*`)  
**Governing docs:** `PLATFORM_ARCHITECTURE_V1.md` · Sprint 3 tenancy packages · Sprint 4 soft RLS + app filters  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`

---

## 0. Purpose & constraints

### 0.1 Why this adapter exists

Sprint 3 adds nullable `company_id` (FK → `companies`) on PMS tables and backfills all live rows to **ALODILA**. Sprint 4 must make **company ops** and **owner portal** reads/writes company-aware **without** rewriting every Supabase call ad hoc.

This document designs a **shared tenancy adapter** that:

1. Resolves the active company (or read scope) from the session.
2. Applies consistent `.eq('company_id', …)` (and write stamps) across `src/lib/db/*`.
3. Defaults safely to ALODILA during transition when claims are missing.
4. Stays out of the Platform Admin companies registry (`src/platform/**`).

### 0.2 Hard rules (this sprint design)

| Rule | Meaning |
|------|---------|
| Design only | **No** application code, **no** SQL, **no** production changes in this workstream |
| Additive | Soft filters; behavior stays single-company ALODILA until a second company exists |
| Zero data loss | Never delete/reparent ALODILA rows |
| Platform boundary | Platform Admin companies CRUD stays in `src/platform/services/companies.js` and **must not** import this adapter |
| Defense in depth | Adapter is app-layer scope; RLS (separate design) remains authoritative |

### 0.3 Personas the adapter must understand

| Persona (today → target) | Adapter behavior |
|--------------------------|------------------|
| **Staff / company login** (`roles.js`: non-owner, non-`super_admin`; target claim `role=company` + `company_id`) | Single-company read + write |
| **Owner portal** (`role=owner` + `owner_crm_id`) | Read scope = that owner’s `company_id` **and** `owner_crm_id` (existing `assertOwnerCrmIdMatchesSession`) |
| **Platform Super Admin** (`role=super_admin`) | **No** implicit full-portfolio PMS access via this adapter; only explicit assume-company (break-glass) when product enables it |
| **Platform Admin UI** | Uses platform services only — **out of adapter** |

---

## 1. `companyDb` API (conceptual)

`companyDb` is the **only** recommended entry for PMS modules when building tenant-scoped Supabase queries. It does **not** replace the Supabase client; it wraps scope resolution + filter/stamp helpers.

### 1.1 Conceptual surface

```
companyDb
├── resolveCurrentCompany()     → CompanyResolution
├── resolveReadScope()          → ReadScope
├── resolveWriteCompany()       → WriteCompany
├── scopedSelect(table, opts)   → PostgREST builder with company filter applied
├── withCompanyEq(query)        → query.eq('company_id', id) | .in('company_id', ids)
├── stampInsert(payload)        → { ...payload, company_id }
├── assertRowInScope(row)       → throws if row.company_id ∉ read scope
└── constants
    └── ALODILA_COMPANY_ID      → a1000000-a10d-4000-8000-000000000001
```

Exact function names may vary at implementation; the **contracts** below are normative.

### 1.2 Design intent

| Concern | Approach |
|---------|----------|
| List/detail SELECT | Always attach company predicate from `resolveReadScope()` |
| INSERT | Always stamp `company_id` from `resolveWriteCompany()` |
| UPDATE / soft-delete | Filter by primary key **and** company scope (never update by id alone across tenants) |
| Nested selects / joins | Prefer filtering the **root** table by `company_id`; child rows must share the same company (RLS backstop) |
| RPC / SECURITY DEFINER | Adapter does not wrap RPCs by default; each RPC must be audited separately (e.g. owner onboarding) |

### 1.3 What `companyDb` is not

- Not a second Supabase client.
- Not an ORM.
- Not a companies registry API (that remains `src/platform/services/companies.js`).
- Not a company switcher (MVP: one login → one company).

### 1.4 Typical call shape (conceptual — not shipped code)

```
// Read
const scope = await resolveReadScope()
let q = supabase.from('properties').select(COLS).eq('is_deleted', false)
q = withCompanyEq(q, scope)
const { data, error } = await q

// Write
const { companyId } = await resolveWriteCompany()
const payload = stampInsert({ name, … }, companyId)
await supabase.from('properties').insert(payload)
```

Modules keep their column lists, sorting, and domain validation; they gain **one** mandatory scope step.

---

## 2. `resolveCurrentCompany()`

### 2.1 Responsibility

Answer: **“Which company is this session operating as right now?”**

Returns a structured resolution (not a bare UUID) so callers can distinguish defaults vs explicit claims.

### 2.2 Conceptual return type

```
CompanyResolution {
  companyId: string            // UUID
  source: 'jwt_company_id'
       | 'jwt_owner_company_id'
       | 'assume_company'
       | 'legacy_default_alodila'
  persona: 'company' | 'owner' | 'platform_super_admin' | 'staff_legacy'
  isDefaulted: boolean         // true when ALODILA was assumed due to missing claim
}
```

### 2.3 Resolution order (MVP / transition)

```
1. No session / no user
     → throw (or return null — modules already require auth for most writes)

2. role = owner  AND  owner_crm_id present
     → companyId from trusted claim `company_id` if present
     → else (transition): resolve company_id from public.owners row for that owner_crm_id
     → else: ALODILA (legacy_default_alodila) until owner rows always carry company_id
     source: jwt_owner_company_id | legacy_default_alodila

3. role = company  AND  company_id present
     → that company_id
     source: jwt_company_id

4. role = super_admin
     → If audited assume-company context is active → that company_id (assume_company)
     → Else → do NOT invent a PMS portfolio company; callers must not run unscoped PMS lists
       (Platform UI does not use this resolver for companies registry)

5. Staff / legacy operator (no company claim yet)
     → ALODILA UUID
     source: legacy_default_alodila
     isDefaulted: true
```

### 2.4 Constant

```
ALODILA_COMPANY_ID = 'a1000000-a10d-4000-8000-000000000001'
```

**Ownership of the constant:** prefer a **PMS-side** tenancy constant (e.g. under `src/lib/tenancy/`) so `src/lib/db/*` does not import `src/platform/**`. Platform may keep its own copy in `src/platform/lib/constants.js` for registry protection — duplicate UUID string is acceptable; do not create a circular dependency platform ↔ tenancy.

### 2.5 Claim trust rules

- Prefer `app_metadata` over `user_metadata` for authorization (aligned with Platform Architecture §5).
- Never trust client-supplied `company_id` query params or form fields as scope authority.
- Align with future RLS helper `current_company_id()` (separate Sprint 4 RLS design).

### 2.6 Compatibility

Until Sprint 5 persona routing hardens claims:

- Missing `company_id` on staff sessions ⇒ **ALODILA** (production continues unchanged).
- `isSuperAdminUser` today checks `role === 'super_admin'` (`src/lib/auth/roles.js`) — adapter must use the same detection until claim names are normalized.

---

## 3. `resolveReadScope()`

### 3.1 Responsibility

Answer: **“Which `company_id` values may this session SELECT?”**

Soft app filters use this before every PMS list/detail load.

### 3.2 Conceptual return type

```
ReadScope {
  mode: 'single' | 'none' | 'owner_bounded'
  companyIds: string[]         // usually length 1
  ownerCrmId: string | null    // set for owner portal
  allowUnscoped: false         // always false for PMS after soft filters land
}
```

### 3.3 Mode rules

| Persona | `mode` | `companyIds` | Extra filters |
|---------|--------|--------------|---------------|
| Company login / staff (incl. legacy default ALODILA) | `single` | `[resolved company]` | `.eq('company_id', id)` on tenant tables |
| Owner portal | `owner_bounded` | `[owner’s company]` | Keep `owner_crm_id` / property graph filters **and** company eq |
| Platform Super Admin without assume-company | `none` | `[]` | Adapter **refuses** broad PMS selects; Platform Admin companies list is separate |
| Platform Super Admin with assume-company | `single` | `[assumed company]` | Same as company login for that context |

### 3.4 Application to queries

- **Primary:** `.eq('company_id', companyIds[0])` when `mode === 'single' | 'owner_bounded'`.
- **Never** omit the filter “because RLS will catch it” for staff lists after Sprint 4 soft filters.
- **Owner portal:** existing `assertOwnerCrmIdMatchesSession` remains mandatory; company filter is additive defense in depth.
- **Nullable column phase:** rows with `company_id IS NULL` should not appear for non-ALODILA companies; for ALODILA transition, prefer treating NULL as out-of-scope once backfill is complete (Sprint 3 packages aim for 0 NULLs). Do not rely on NULL-as-ALODILA in app filters after Package 5 closure.

### 3.5 Tables in soft-filter scope

Aligned with architecture §3.3 / Sprint 3 packages:

`owners`, `tenants`, `properties`, `units`, `meters`, `contracts`, `invoices`, `payments`, `maintenance_requests`

**Not** filtered by this adapter:

- `companies` (platform registry only)
- Auth / storage internals
- Contaminant / quarantined tables

---

## 4. `resolveWriteCompany()`

### 4.1 Responsibility

Answer: **“Which `company_id` must be stamped on INSERT (and verified on UPDATE)?”**

### 4.2 Conceptual return type

```
WriteCompany {
  companyId: string
  source: same as CompanyResolution.source
  allowWrite: boolean
  reasonIfDenied: string | null
}
```

### 4.3 Stamp rules

| Operation | Rule |
|-----------|------|
| **INSERT** | Always set `company_id` from resolver; never leave NULL for new rows once adapter is wired |
| **UPDATE of business fields** | Do not allow changing `company_id` from the client; omit from update payloads |
| **Soft-delete** | `UPDATE … SET is_deleted` must include company scope in the WHERE/filter chain |
| **Child rows** (units under property, invoices under contract, etc.) | Stamp = parent’s company (must equal session write company); reject cross-company parent ids |

### 4.4 Persona write matrix

| Persona | `allowWrite` | `companyId` |
|---------|--------------|-------------|
| Company login / staff legacy | `true` | Resolved / ALODILA default |
| Owner portal | `false` for ops tables (portal remains read-only); maintenance create paths if any stay owner-bounded and must stamp owner’s company only when product already allows that write |
| Platform Super Admin (no assume) | `false` for PMS domain writes via adapter |
| Platform Super Admin (assume-company) | `true` only in audited context → assumed `companyId` |
| Platform Admin companies registry | **N/A** — does not call this API |

### 4.5 Parent inheritance (conceptual)

When creating a child that has a parent FK:

1. Resolve write company from session.
2. Load parent with **read scope** (same company).
3. If parent missing or `parent.company_id !== write.companyId` → reject.
4. Stamp child with `write.companyId` (equal to parent).

This closes secondary-unit / cross-attach gaps at the app layer pending structural Sprint 6 work.

### 4.6 Smart import & bulk paths

`src/lib/db/smartImport.js` and bulk unit creates must call `resolveWriteCompany()` once per batch and stamp every inserted row; do not mix companies in one import job.

---

## 5. Folder structure (proposed under `src/lib`)

Proposed layout — **not created in this design pass**:

```
src/lib/
├── tenancy/                          # NEW — shared tenancy adapter
│   ├── constants.js                  # ALODILA_COMPANY_ID (PMS copy)
│   ├── types.js                      # JSDoc typedefs (optional)
│   ├── resolveCurrentCompany.js
│   ├── resolveReadScope.js
│   ├── resolveWriteCompany.js
│   ├── companyDb.js                  # façade: withCompanyEq, stampInsert, scoped helpers
│   ├── assumeCompanyContext.js       # optional; break-glass session storage (later)
│   └── index.js                      # public exports
│
├── auth/
│   ├── roles.js                      # EXISTING — persona helpers (extend claims later)
│   └── ownerScope.js                 # EXISTING — keep; owner portal defense-in-depth
│
├── db/                               # EXISTING modules — consumers of adapter
│   ├── owners.js
│   ├── tenants.js
│   ├── properties.js
│   ├── units.js
│   ├── contracts.js
│   ├── invoices.js
│   ├── payments.js
│   ├── maintenance.js
│   ├── dashboard.js
│   ├── reports.js
│   ├── ownerPortal.js
│   ├── smartImport.js
│   ├── contractFinance.js
│   ├── ledgerTotals.js
│   └── tenantStatement.js
│
├── ai/                               # consumers via db modules (indirect)
│   └── chatContext.js
│
└── supabase/
    └── client.js                     # unchanged singleton
```

### 5.1 Import rules

| From | May import |
|------|------------|
| `src/lib/db/*` | `src/lib/tenancy/*`, `src/lib/auth/*`, `src/lib/supabase/client` |
| `src/lib/tenancy/*` | `src/lib/auth/roles`, `src/lib/supabase/client` (only if resolver needs `getUser`) |
| `src/lib/ai/*` | Prefer scoping via already-scoped `db` loaders; may call `resolveReadScope` only if building direct queries |
| `src/platform/**` | **Must not** import `src/lib/tenancy` for companies registry |
| `src/lib/tenancy` | **Must not** import `src/platform/**` |

### 5.2 Why not put adapter inside `src/platform`

Platform is the **control plane**. Tenancy adapter is the **company ops / owner portal data plane**. Mixing them would pull PMS filters into registry code and risk circular ownership.

---

## 6. Shared query helper architecture

### 6.1 Layers

```
Pages / hooks
    ↓
src/lib/db/<module>.js          (domain API: getActiveProperties, createContract, …)
    ↓
src/lib/tenancy/companyDb.js    (scope + stamp helpers)
    ↓
src/lib/tenancy/resolve*.js     (session → company / scope)
    ↓
src/lib/supabase/client.js     (PostgREST)
    ↓
Postgres + RLS
```

### 6.2 Helper responsibilities

| Helper | Input | Output / effect |
|--------|-------|-----------------|
| `withCompanyEq(query, scope)` | Supabase filter builder + `ReadScope` | Adds `.eq('company_id', …)` or throws if `mode === 'none'` |
| `stampInsert(row, write)` | Plain object + `WriteCompany` | Returns row with `company_id` set; throws if `!allowWrite` |
| `scopedSelect(table, columns, scope)` | Optional convenience | `from(table).select(columns)` + company eq + optional `is_deleted` |
| `assertRowInScope(row, scope)` | Loaded row | Throws on mismatch (detail pages / mutations) |

### 6.3 Migration strategy for existing modules (implementation later)

Recommended order when coding begins (after Package 5 + inventory sign-off):

1. Land `src/lib/tenancy/*` with default-to-ALODILA (behaviorally identical on production today).
2. Wire **writes** (stamp) on create paths — owners, tenants, properties, units, contracts, invoices, payments, maintenance.
3. Wire **reads** on list/detail loaders in the same modules.
4. Wire aggregates: `dashboard.js`, `reports.js`, `ledgerTotals.js`, `contractFinance.js`, `tenantStatement.js`.
5. Wire `ownerPortal.js` (company eq additive to owner CRM scope).
6. Wire `smartImport.js`.
7. Confirm AI (`chatContext.js`) inherits scope via db loaders (no unscoped parallel queries).

No big-bang rewrite: each module gains filter/stamp calls while keeping exported function signatures stable where possible.

### 6.4 Error model (conceptual)

| Condition | Behavior |
|-----------|----------|
| Supabase not configured | Existing throw (unchanged) |
| Unscoped read attempted (`mode: none`) | Throw clear tenancy error — do not silently return all rows |
| Write denied (owner / platform without assume) | Throw before network |
| Row company mismatch on update | Throw; zero rows updated must not be treated as success without check |

### 6.5 Interaction with soft RLS

- App adapter: first line of defense; prevents accidental unscoped UI queries.
- RLS: second line; blocks forged clients / missed filters.
- Both must agree on ALODILA default and claim paths (see companion RLS design).

### 6.6 Caching

MVP: **no** long-lived company cache beyond the current request/call. Resolvers may read `getUser()` per call (same pattern as `createProperty` today). Optional short-lived memoization is a later optimization, not a Sprint 4 requirement.

---

## 7. Dependency map

### 7.1 Upstream (adapter depends on)

```
Supabase Auth session (JWT)
    ├── app_metadata / user_metadata role claims
    ├── company_id (future company login; optional on owner)
    └── owner_crm_id (owner portal)

src/lib/auth/roles.js
    ├── appRole / isOwnerPortalUser / isSuperAdminUser / ownerCrmIdFromUser

src/lib/auth/ownerScope.js
    └── assertOwnerCrmIdMatchesSession (owner portal only; stays separate)

src/lib/supabase/client.js
```

### 7.2 Downstream (will consume adapter — implementation later)

| Consumer area | Paths | Adapter use |
|---------------|-------|-------------|
| CRM | `db/owners.js`, `db/tenants.js` | read scope + write stamp |
| Portfolio | `db/properties.js`, `db/units.js` | read + write + parent check |
| Contracts | `db/contracts.js`, `db/contractFinance.js` | read + write + unit company check |
| Finance | `db/invoices.js`, `db/payments.js`, `db/ledgerTotals.js`, `db/tenantStatement.js` | read + write |
| Maintenance | `db/maintenance.js` | read + write |
| Ops aggregates | `db/dashboard.js`, `db/reports.js` | read scope on all underlying tables |
| Owner portal | `db/ownerPortal.js` | company eq + existing owner CRM assert |
| Import | `db/smartImport.js` | batch stamp |
| AI | `lib/ai/chatContext.js` (via db) | inherit scoped loaders |
| Exports / PDF | print/export via already-scoped data | no direct DB if pages pass scoped rows |

### 7.3 Explicit non-consumers

| Area | Path | Reason |
|------|------|--------|
| Platform companies registry | `src/platform/services/companies.js` | Control-plane CRUD on `companies`; must stay unscoped by PMS tenancy |
| Platform UI/hooks | `src/platform/pages/**`, `src/platform/hooks/**` | Same boundary |
| Brand / i18n / money helpers | `src/lib/brand`, `format`, `money` | No tenant queries |
| Validation schemas | `src/lib/validation/schemas.js` | May later accept `company_id` fields; not a runtime scope resolver |

### 7.4 Cross-document dependencies

| Document | Relationship |
|----------|--------------|
| `PLATFORM_ARCHITECTURE_V1.md` | Personas, default ALODILA, defense in depth |
| `SPRINT3_TENANCY_EXECUTION.md` | Column presence / backfill assumptions |
| Sprint 4 RLS design (companion) | DB helpers / policies must match resolver claim paths |
| Sprint 4 app inventory / read-write reports (companion) | Concrete call sites to wire |

### 7.5 Dependency diagram

```
                    ┌─────────────────────────┐
                    │  Platform Admin UI      │
                    │  src/platform/**        │
                    │  companies registry     │
                    └───────────┬─────────────┘
                                │ DOES NOT USE
                                ▼
                    ┌─────────────────────────┐
                    │  tenancy adapter        │◄── roles.js / ownerScope.js
                    │  src/lib/tenancy/**     │
                    └───────────┬─────────────┘
                                │ USED BY
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        src/lib/db/*      owner portal      ai/chatContext
        (PMS modules)     paths             (via db)
              │
              ▼
        supabase client → Postgres (company_id + soft RLS)
```

---

## 8. Explicit non-goals / no implementation yet

### 8.1 This document does **not** authorize

- Creating `src/lib/tenancy/**` files
- Editing any `src/lib/db/*` module
- Writing or applying SQL / RLS migrations
- Changing production data or Auth claims
- Binding `companies.auth_user_id` or provisioning second-company logins
- Enabling Platform Super Admin break-glass UI

### 8.2 Product / architecture non-goals (still out of MVP)

- Company memberships / multi-seat staff
- Company switcher UI
- Multi-company users
- Billing / subscription enforcement via this adapter
- Database-per-tenant or schema-per-tenant
- Moving Platform Admin onto the adapter
- Hard `NOT NULL` cutover (deferred; soft filters + nullable columns first)
- Rewriting owner onboarding NID oracle (company-scoped onboarding is Sprint 5+)

### 8.3 Deferred design decisions (record only)

| Topic | Defer to |
|-------|----------|
| Exact assume-company storage (sessionStorage vs platform table) | Sprint 7 break-glass |
| Claim rename `super_admin` → `platform_super_admin` | Sprint 5 auth personas |
| Whether owner JWT always embeds `company_id` | Sprint 5 + RLS helper alignment |
| Composite unique constraints | Sprint 6 isolation debt |

### 8.4 Success criteria when implementation is later approved

1. Every PMS SELECT in `src/lib/db/*` applies `resolveReadScope()` (or equivalent helper).
2. Every PMS INSERT stamps `company_id` via `resolveWriteCompany()`.
3. Production single-company behavior unchanged (all paths resolve to ALODILA).
4. Platform Admin companies registry untouched by adapter imports.
5. Two-company clone test (with RLS) shows zero cross-tenant reads through app loaders.

---

## Document control

| Field | Value |
|-------|--------|
| Version | 0.1 DRAFT |
| Authoring agent | AGENT 2 — Shared Tenancy Adapter Design |
| Implementation | Stream A landed · Stream C wired for reads; soft RLS not done |
| ALODILA UUID | `a1000000-a10d-4000-8000-000000000001` |

---

*End of Sprint 4 Shared Tenancy Adapter design*
