# Sprint 2B — Implementation Blueprint (Pre-Code)

**Status:** APPROVED — Phase 2B implemented  
**Phase:** 2B — Mutation / lifecycle layer  
**Prerequisite:** Phase 2A APPROVED & implemented (`src/platform/**`)  
**Parent design:** `docs/SPRINT2_PLATFORM_ADMIN_DESIGN.md`  
**Code:** Not generated yet  
**SQL / schema / Auth / PMS:** Forbidden

---

## 0. Phase 2B scope lock

### In scope

| Capability | Notes |
|------------|--------|
| Create Company | Insert into `public.companies` only |
| Edit Company | Name / slug / notes (with protections) |
| Suspend / Activate | Status transitions only |
| Soft Delete | `is_deleted = true` (non-ALODILA) |
| Restore (recommended) | `is_deleted = false` for non-ALODILA soft-deleted rows |
| Company Details editing | Edit route and/or inline actions on detail |
| Validation + friendly errors | Client-first; map PostgREST errors |
| ALODILA protection | Hard blocks (see §8) |
| Extension seams | Audit, feature flags/modules, subscription — **stubs/interfaces only** |

### Out of scope

| Item | Deferred to |
|------|-------------|
| Subscription UI panels | 2C |
| Login binding writes (`auth_user_id`) | Later Auth sprint |
| Real audit table / SQL | Future approved migration |
| Real feature-flag persistence | Future |
| `company_id` / PMS tenancy | Later sprint |
| Auth claim changes, RLS changes | Forbidden |
| Hard DELETE | Forbidden forever in Platform Admin |
| Renaming / suspending / soft-deleting ALODILA | Forbidden |

### Hard constraints (unchanged)

- Platform zone only: `src/platform/**` (+ minimal `App.jsx` route additions for new paths).
- No cross-imports with PMS.
- Flow: **Component → Hook → Service → Supabase**.
- Components never call Supabase directly.
- Removing `src/platform/` + App wiring must leave PMS intact.
- Keep build green.
- No SQL, schema, Auth, PMS, RLS changes.

---

## 1. File tree delta (2B additions)

```
src/platform/
  pages/
    CompanyCreate.jsx                 # NEW — /platform/companies/new
    CompanyEdit.jsx                   # NEW — /platform/companies/:id/edit
  components/
    CompanyForm.jsx                   # NEW — shared create/edit fields
    CompanyLifecycleActions.jsx       # NEW — suspend/activate/soft-delete/restore buttons
    ConfirmCompanyActionModal.jsx     # NEW — confirm destructive / status changes
    ProtectedCompanyNotice.jsx        # NEW — shown on ALODILA detail/edit (read-only identity)
  hooks/
    useCompanyCreate.js               # NEW
    useCompanyUpdate.js               # NEW
    useCompanyStatus.js               # NEW — suspend/activate/provisioning→active
    useCompanySoftDelete.js           # NEW
    useCompanyRestore.js              # NEW
  services/
    companies.js                      # EXTEND — mutation exports (keep reads)
    companiesErrors.js                # NEW — map PostgREST → friendly codes
  lib/
    companyValidators.js              # NEW — name/slug/status/notes
    companyTransitions.js             # NEW — allowed status matrix
    protectedCompanies.js             # NEW — ALODILA hard rules
    companyPayload.js                 # NEW — normalize create/update payloads
  extensions/                         # NEW — reserved seams (no real backends in 2B)
    audit/
      auditTypes.js                   # event name constants + payload shape
      auditEmitter.js                 # no-op / console stub; stable API for future
    flags/
      companyModules.js               # default module map + getters (all defaults)
      featureFlagTypes.js             # flag key constants
    subscription/
      subscriptionTypes.js            # plan/status enums + placeholder shape
      subscriptionAccessors.js        # read stubs returning “not_configured”
  i18n/
    platform.ar.js / platform.en.js   # EXTEND — form, errors, confirms, protection copy
  PlatformRoutes.jsx                  # EXTEND — new + edit routes
```

**Do not touch:** PMS pages, `DashboardLayout`, `OwnerLayout`, `lib/db/**`, Auth, SQL.

**App.jsx:** No change required if routes stay under existing `/platform/*` nested tree (preferred). Only touch App if route packaging forces it — **prefer zero App.jsx churn in 2B**.

---

## 2. Routes (2B)

| Path | Page | Notes |
|------|------|--------|
| `/platform/companies/new` | `CompanyCreate` | Super Admin |
| `/platform/companies/:id/edit` | `CompanyEdit` | Super Admin; ALODILA → limited or blocked fields |
| Existing detail `/platform/companies/:id` | Extended | Lifecycle action bar + link to edit |

Route order inside `PlatformRoutes` (critical):

```
companies/new          BEFORE  companies/:id
companies/:id/edit     BEFORE  or as child of companies/:id
companies/:id
```

---

## 3. Components

### 3.1 `CompanyForm`

Presentational controlled form used by Create + Edit.

| Field | Create | Edit (normal) | Edit (ALODILA) |
|-------|--------|---------------|----------------|
| `name` | editable, required | editable | **locked / not rendered as input** |
| `slug` | editable, required | editable | **locked** |
| `notes` | optional | optional | editable (internal notes OK) |
| `status` | optional select; default `active` | not on form (use lifecycle actions) | locked via lifecycle |

Props (conceptual): `mode`, `initialValues`, `values`, `errors`, `onChange`, `onSubmit`, `submitting`, `lockedFields`.

### 3.2 `CompanyLifecycleActions`

Rendered on **Company Detail** (and optionally list row menus later).

Actions:

- Suspend (if `active` or `provisioning` → target `suspended`)
- Activate (if `suspended` or `provisioning` → `active`)
- Soft Delete (if not deleted)
- Restore (if deleted)

For ALODILA: **render no destructive/status actions** (or all disabled with `ProtectedCompanyNotice`).

### 3.3 `ConfirmCompanyActionModal`

Shared confirm dialog:

- Props: `open`, `actionType`, `company`, `onConfirm`, `onCancel`, `busy`
- For soft-delete of normal companies: confirm with company name
- Typed slug confirm **not required** for non-ALODILA (ALODILA never reaches this path)
- Uses shared `Modal` UI if available; else lightweight platform modal built on shared primitives

### 3.4 `ProtectedCompanyNotice`

Banner on ALODILA detail/edit:

> Seeded ALODILA company is protected. Name, slug, status, and deletion cannot be changed.

### 3.5 Page components

| Page | Responsibility |
|------|----------------|
| `CompanyCreate` | Form → `useCompanyCreate` → navigate to detail on success |
| `CompanyEdit` | Load via `useCompanyDetail`; form → `useCompanyUpdate`; ALODILA locks |
| `CompanyDetail` (extend) | Add Edit link + `CompanyLifecycleActions` |
| `CompaniesList` / Dashboard (light touch) | Optional “Create company” CTA linking to `/platform/companies/new` |

### 3.6 Isolation

No component imports Supabase. No component imports PMS modules.

---

## 4. Hooks

All hooks: local state only; call services; optionally emit audit events via extension seam.

| Hook | API (conceptual) | Calls |
|------|------------------|--------|
| `useCompanyCreate()` | `{ submit, submitting, error, fieldErrors, reset }` | `createCompany` |
| `useCompanyUpdate(id)` | `{ submit, submitting, error, fieldErrors }` | `updateCompany` |
| `useCompanyStatus(id)` | `{ setStatus, submitting, error }` | `setCompanyStatus` |
| `useCompanySoftDelete(id)` | `{ softDelete, submitting, error }` | `softDeleteCompany` |
| `useCompanyRestore(id)` | `{ restore, submitting, error }` | `restoreCompany` |

**State management rule:** Keep mutation state inside these hooks. No global Platform store. After success: navigate and/or call parent `reload` / invalidate by remounting detail via navigation.

**Optimistic updates:** Not required in 2B; prefer await → toast → reload/navigate.

---

## 5. Services

### 5.1 Extend `services/companies.js` (mutations)

| Export | DB op | Payload rules |
|--------|-------|----------------|
| `createCompany({ name, slug, notes?, status? })` | `INSERT` … `select` single | `auth_user_id` omitted/null; `is_deleted` false |
| `updateCompany(id, { name?, slug?, notes? })` | `UPDATE` identity fields only | Never update `id`; never set `auth_user_id` |
| `setCompanyStatus(id, status)` | `UPDATE status` | Status enum only |
| `softDeleteCompany(id)` | `UPDATE is_deleted=true` | Optionally also `status='suspended'` |
| `restoreCompany(id)` | `UPDATE is_deleted=false` | Does not auto-change status |

Every mutation:

1. Runs **protection checks** (lib) before network.
2. Runs **validators** before network.
3. Performs Supabase call.
4. Maps errors via `companiesErrors.js`.
5. Calls `auditEmitter.record(...)` (stub) on success (and optionally on denied protection).

### 5.2 `services/companiesErrors.js`

Map to stable error codes consumed by UI/i18n:

| Code | Cause |
|------|--------|
| `VALIDATION` | Client validator failure (attach `fields`) |
| `PROTECTED_COMPANY` | ALODILA rule blocked |
| `INVALID_TRANSITION` | Status matrix reject |
| `SLUG_TAKEN` | Unique violation on `slug` (Postgres `23505`) |
| `CHECK_VIOLATION` | CHECK fail (slug format / status) |
| `UNAUTHORIZED` | RLS / 401 / 403 |
| `NOT_FOUND` | Update matched 0 rows |
| `NETWORK` | Abort / fetch failure |
| `UNKNOWN` | Fallback |

Never surface raw Postgres text to end users as the primary message.

### 5.3 Forbidden service behaviors (2B)

- Writing `auth_user_id`
- Changing `id`
- Hard `DELETE`
- Touching any table other than `companies`
- Calling PMS services

---

## 6. Validation

### 6.1 `lib/companyValidators.js`

Pure functions; no I/O.

| Field | Rules |
|-------|--------|
| `name` | Required after trim; `char_length > 0`; max **200** (app-side) |
| `slug` | Required; lowercase; match `^[a-z0-9]+(?:-[a-z0-9]+)*$`; max **63**; no leading/trailing hyphen |
| `status` | One of `active \| suspended \| provisioning` |
| `notes` | Optional; max **2000**; trim |

Helpers:

- `normalizeSlugInput(raw)` — trim, lowercase, collapse spaces to `-` (create UX only; edit may apply on blur)
- `validateCreateInput(input) → { ok, fields }`
- `validateUpdateInput(input, { lockedFields }) → { ok, fields }`

### 6.2 Duplicate slug

1. Client cannot reliably know all slugs without a query; **do not** add a separate existence RPC in 2B.
2. Rely on UNIQUE(`slug`) + map `23505` → `SLUG_TAKEN`.
3. Optional enhancement (still read-only): before insert, `list`/`maybeSingle` by slug — **optional**, not required; prefer DB as source of truth.

Soft-deleted slug still blocks reuse (known Sprint 1 constraint). Error copy should say slug is already used (including possibly deleted companies).

### 6.3 Status validation

`lib/companyTransitions.js`:

```
provisioning → active | suspended
active       → suspended
suspended    → active
```

Disallow:

- `suspended → provisioning`
- `active → provisioning` (unless product later needs it — **not in 2B**)
- Any transition on soft-deleted row until restored
- Any transition on ALODILA

---

## 7. State management

| Concern | Approach |
|---------|----------|
| Form values | Local React state in page / form |
| Field errors | Hook `fieldErrors` map |
| Submit busy | Hook `submitting` |
| Confirm modal | Local UI state on detail page |
| List/detail refresh | Navigate to detail after create; `reload()` after lifecycle |
| Toasts | Shared ToastProvider (if project exposes a hook); else inline success banners |

No Redux/Zustand/Context for company mutations.

---

## 8. Protection logic (ALODILA)

### 8.1 Identity

Protected if **either**:

- `id === ALODILA_COMPANY_ID` (`a1000000-a10d-4000-8000-000000000001`), or
- `slug === 'alodila'`

Centralize in `lib/protectedCompanies.js`:

| Export | Behavior |
|--------|----------|
| `isProtectedCompany(company\|id\|slug)` | Boolean |
| `assertCanUpdateIdentity(company, patch)` | Throws `PROTECTED_COMPANY` if name/slug change attempted |
| `assertCanChangeStatus(company)` | Always throws for protected |
| `assertCanSoftDelete(company)` | Always throws for protected |
| `assertCanRestore(company)` | Allow restore only if somehow deleted (should not happen); still prefer block soft-delete so restore unused for ALODILA |
| `lockedFieldsFor(company)` | `{ name, slug, status, softDelete }` flags for UI |

### 8.2 Hard product rules (user directive)

The seeded ALODILA company must **never**:

| Action | Enforcement |
|--------|-------------|
| Soft-deleted | Service + UI block |
| Suspended | Service + UI block |
| Slug changed | Service + UI lock |
| UUID changed | Never exposed; updates never include `id` |
| Renamed (`name` change) | Service + UI lock |

**Allowed on ALODILA in 2B:** update `notes` only (optional but useful). If product prefers zero writes, notes may also be locked — **default: notes editable**.

### 8.3 Defense in depth

1. UI hides/disables actions.  
2. Validators / `assert*` in service before network.  
3. RLS still requires Super Admin (unchanged).  
4. Audit stub records `protection.denied` if UI somehow calls service.

---

## 9. Mutation flow

### 9.1 Create

```
CompanyCreate
  → CompanyForm validate (client)
  → useCompanyCreate.submit
      → validateCreateInput
      → createCompany (service)
          → insert companies
          → auditEmitter.record('company.created', …)
      → map errors
  → toast success → navigate /platform/companies/:id
```

### 9.2 Edit (identity)

```
CompanyEdit
  → load useCompanyDetail
  → if protected: lock name/slug
  → CompanyForm
  → useCompanyUpdate.submit
      → assertCanUpdateIdentity
      → validateUpdateInput
      → updateCompany
      → audit 'company.updated'
  → navigate back to detail
```

### 9.3 Suspend / Activate

```
CompanyDetail → ConfirmCompanyActionModal
  → useCompanyStatus.setStatus
      → assertCanChangeStatus
      → assert transition matrix
      → setCompanyStatus
      → audit 'company.status_changed'
  → reload detail
```

### 9.4 Soft delete / restore

```
Confirm → useCompanySoftDelete / useCompanyRestore
  → assert protection
  → softDeleteCompany / restoreCompany
  → audit 'company.soft_deleted' | 'company.restored'
  → reload or redirect to list
```

---

## 10. Error handling

### 10.1 Layers

1. **Field validation** — inline under inputs; block submit.  
2. **Protection / transition** — toast or modal error; no network.  
3. **Server** — `companiesErrors.map(error)` → i18n key.  
4. **Unknown** — generic `platform.errors.unknown`.

### 10.2 UX copy keys (illustrative)

- `platform.errors.nameRequired`
- `platform.errors.slugInvalid`
- `platform.errors.slugTaken`
- `platform.errors.statusInvalid`
- `platform.errors.protectedCompany`
- `platform.errors.invalidTransition`
- `platform.errors.unauthorized`
- `platform.errors.notFound`
- `platform.errors.network`

### 10.3 Success feedback

Short toast / banner: created, updated, suspended, activated, deleted, restored.

---

## 11. Audit Log integration design (reserved)

### 11.1 Goal

Future durable audit must **not** require rewriting mutation services — only swapping the emitter implementation.

### 11.2 Stable API (`extensions/audit/auditEmitter.js`)

```
record(event): Promise<void>
  event = {
    type: string,           // see auditTypes
    companyId: string | null,
    actorUserId: string | null,  // from session when available
    at: ISO string,
    payload: object,        // before/after snapshots (redacted)
    source: 'platform_admin',
  }
```

### 11.3 Event types (`auditTypes.js`)

- `company.created`
- `company.updated`
- `company.status_changed`
- `company.soft_deleted`
- `company.restored`
- `company.protection_denied`

### 11.4 2B implementation

- Default: **no-op** (or `console.debug` behind `import.meta.env.DEV` only).
- Services call `record` after successful mutation and on protection deny.
- **Do not** create DB table in 2B.
- Future: emitter writes to `platform_audit_events` (migration later) or Edge Function — same `record` signature.

### 11.5 Privacy

Do not put secrets in payload. `notes` may be included truncated. Never log Auth tokens.

---

## 12. Feature Flags / Company Modules design (reserved)

### 12.1 Goal

Per-company module toggles (e.g. maintenance, smart import, AI) must plug in later without redesigning company CRUD.

### 12.2 Shape (`extensions/flags/`)

```
CompanyModules = {
  companyId: string,
  modules: {
    properties: boolean,
    tenants: boolean,
    contracts: boolean,
    finance: boolean,
    maintenance: boolean,
    reports: boolean,
    smartImport: boolean,
    ai: boolean,
  }
}
```

### 12.3 2B behavior

- `getCompanyModules(companyId)` → **defaults all `true`** (or all enabled) from in-memory defaults.
- `isModuleEnabled(companyId, key)` → reads defaults only.
- **No UI** in 2B for editing flags (optional disabled “Modules” section on detail is **2C+**; 2B only lands accessors).
- Future persistence: JSONB column on `companies` or side table — additive migration; accessors switch from defaults to DB without changing callers.

### 12.4 Platform feature flags (env)

Optional later (2D): `VITE_PLATFORM_ADMIN_ENABLED`. Not required to implement in 2B; document hook point in `PlatformGuard` for future.

---

## 13. Subscription integration design (reserved — no redesign later)

### 13.1 Principle

Company registry mutations must remain independent of billing. Subscription is a **side panel / parallel domain** keyed by `company_id`.

### 13.2 Placeholder contract (`extensions/subscription/`)

```
SubscriptionSummary = {
  companyId: string,
  planCode: 'none' | string,
  status: 'not_configured' | 'trialing' | 'active' | 'past_due' | 'canceled',
  renewsAt: string | null,
}
```

- `getSubscriptionSummary(companyId)` → `{ status: 'not_configured', planCode: 'none', … }` in 2B/2C.
- Create/Update company **must not** require subscription fields.
- Future billing tables FK → `companies.id`; Platform Detail hosts a panel that calls accessors only.

### 13.3 Guarantee

Adding Stripe/webhooks later changes `subscriptionAccessors` + new UI panel (2C placeholders → real), **not** `createCompany` / `updateCompany` signatures.

---

## 14. Dependency & import boundaries (2B)

```
pages/CompanyCreate|Edit|Detail
  → components (form, modal, actions)
  → hooks (mutations)
      → services/companies (+ companiesErrors)
          → lib (validators, transitions, protectedCompanies, payload)
          → extensions/audit (emit)
          → shared supabase client
```

**Allowed shared imports:** `components/ui/**`, toast, Modal (if shared), `lib/auth/roles` (guard only), supabase client (services only), i18n.

**Forbidden:** `lib/db/**`, PMS pages, Dashboard/Owner layouts, writing `auth.users`.

---

## 15. Soft-delete semantics (clarified)

| Topic | Rule |
|-------|------|
| Default list | Hides `is_deleted` (existing 2A) |
| Soft delete | Sets `is_deleted=true`; recommend also `status=suspended` for clarity |
| Restore | Clears `is_deleted`; leaves status as-is (admin may Activate after) |
| Slug uniqueness | Still global; deleted slug blocks reuse — show `slugTaken` message |
| ALODILA | Cannot soft-delete |

---

## 16. Implementation order (when coding approved)

1. `protectedCompanies`, `companyValidators`, `companyTransitions`, `companyPayload`  
2. `companiesErrors` + mutation functions in `companies.js`  
3. `extensions/audit|flags|subscription` stubs  
4. Hooks  
5. `CompanyForm`, modal, lifecycle actions, protected notice  
6. Pages create/edit; extend detail + list CTA  
7. Routes order fix in `PlatformRoutes`  
8. i18n keys  
9. Manual acceptance (§17)  
10. Build + isolation grep

---

## 17. Acceptance checklist (2B)

- [ ] Create company with valid name/slug → appears in list/detail  
- [ ] Invalid slug blocked client-side  
- [ ] Duplicate slug → friendly `slugTaken`  
- [ ] Edit non-ALODILA name/slug/notes  
- [ ] Suspend ↔ Activate on non-ALODILA  
- [ ] Soft-delete hides from default list; restore works  
- [ ] ALODILA: cannot rename, cannot change slug, cannot suspend, cannot soft-delete; UUID never editable  
- [ ] ALODILA notes update allowed (if approved default)  
- [ ] No `auth_user_id` writes  
- [ ] No PMS/Auth/SQL changes  
- [ ] Isolation greps pass; build green  
- [ ] Audit emitter called (no-op) on mutations  
- [ ] Subscription/flag accessors exist and do not affect CRUD  

---

## 18. Risks specific to 2B

| Risk | Mitigation |
|------|------------|
| Super Admin RLS write failure | Same as 2A; surface `UNAUTHORIZED` |
| Accidental ALODILA mutation | Hard lib asserts + UI locks |
| Slug normalize differs from DB CHECK | Share one regex with DB (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) |
| Race on duplicate slug | DB unique + error map |
| Scope creep into Auth binding | Explicit forbid in service payloads |
| Extension stubs become fake product | Document “not configured”; no misleading enabled billing UI in 2B |

---

## 19. Approval gate

| Item | Status |
|------|--------|
| Components | Awaiting approval |
| Hooks | Awaiting approval |
| Services | Awaiting approval |
| Validation | Awaiting approval |
| State management | Awaiting approval |
| Mutation flow | Awaiting approval |
| Error handling | Awaiting approval |
| Protection logic | Awaiting approval |
| Audit Log design | Awaiting approval |
| Feature Flags design | Awaiting approval |
| Subscription seam | Awaiting approval |
| Application code | **Not started** |

### Defaults to confirm

1. ALODILA **notes** remain editable; name/slug/status/delete locked.  
2. Soft-delete also sets `status=suspended`.  
3. Restore is in 2B scope.  
4. Create default status = `active`.  
5. Audit = no-op stub with stable API.  
6. No App.jsx changes if nested routes suffice.

---

*End of Sprint 2B Implementation Blueprint — PLANNING ONLY*
