# Platform Architecture v1

**Product:** ALODILA-PMS → Enterprise Multi-Tenant SaaS  
**Document type:** Engineering blueprint (planning only)  
**Status:** DRAFT — revised, awaiting approval  
**Constraints:** Production data belongs to ALODILA Company and must never be deleted or modified unless explicitly requested. Transformation must be incremental, safe, and fully backward compatible.

---

## 0. Platform Principles

These principles govern every design and sprint decision. They override convenience.

### Zero Data Loss

- ALODILA production rows are never deleted, truncated, or “cleaned up” to make SaaS easier.
- Soft-delete remains the only retirement path for business data unless explicitly requested otherwise.
- Backfills annotate; they do not replace or move historical facts.

### Backward Compatibility

- Each step must leave the current ALODILA operator and owner-portal experience working.
- Existing login flows continue until a deliberate, tested cutover.
- Absence of new claims defaults safely to **ALODILA Company** during transition.

### Additive Migrations Only

- Prefer `ADD COLUMN`, new tables, new policies alongside old ones.
- Do not drop columns, rewrite enums destructively, or replace RLS in a single irreversible step.
- New constraints are introduced only after data audits prove they will not fail on live rows.

### No Destructive SQL

- No `DROP TABLE`, mass `DELETE`, or unconstrained `UPDATE` on production business data as part of SaaS work.
- No destructive “fix” scripts against ALODILA portfolio data without explicit written approval.
- Rollback plans must restore service without needing to recreate customer data from memory.

### Production First

- Design for the live ALODILA database as the system of record.
- Staging/clone validates first; production receives only proven additive changes.
- ALODILA is Company #1 forever in this model — not a disposable demo tenant.

### Security Before Features

- Isolation, claim alignment, and RLS correctness precede billing UI, multi-company marketing, and new modules.
- Cross-tenant leak risk blocks release even if features look complete.
- Platform Super Admin power is explicit and audited — never accidental.

### Every Sprint Must Be Reversible

- Every sprint deliverable has a rollback path (revert app deploy and/or disable new code paths).
- Feature flags or default-to-ALODILA behavior keep incomplete tenancy from breaking production.
- If a sprint cannot be reversed safely, it is split until it can.

### One Company = One Login (MVP)

- **MVP / V1:** each Company has exactly **one** login account (one Supabase Auth user bound to that company).
- No company memberships table, no multi-user staff roster, no company switcher in MVP.
- Multi-user companies (memberships, invites, roles inside a company) are explicitly **post-MVP**.

---

## 1. Overall SaaS Architecture

### 1.1 Target shape

ALODILA-PMS evolves from a **single-operator property management system** into a **multi-company SaaS platform** where:

- Each **Company** is a paying SaaS customer (a property-management business or portfolio operator).
- **ALODILA Company** is Company #1 — existing production data, preserved in place.
- The same application codebase serves all companies.
- Isolation is enforced in **Postgres RLS + application query scope**, with Supabase Auth as identity.
- **MVP:** one Auth login operates each company’s entire PMS console.

### 1.2 Logical layers

```
┌─────────────────────────────────────────────────────────┐
│  Clients                                                 │
│  Platform Super Admin UI · Company Ops UI · Owner Portal │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  Application (Vite/React SPA)                            │
│  Session → classify persona → route dashboard            │
│  Company ops: single login ⇒ single company_id           │
│  All company data access scoped by company_id            │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  Supabase                                                │
│  Auth (users) · Postgres + RLS · (optional) Edge/API     │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  Domain data (per company)                               │
│  owners · properties · units · tenants · contracts ·     │
│  invoices · payments · maintenance                       │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Non-goals for MVP (V1)

- Not a rewrite of the frontend framework.
- Not a move off Supabase.
- Not hard-deleting or relocating ALODILA production rows.
- Not **company memberships** / multi-seat staff per company.
- Not company switchers or multi-company users.
- Not billing webhooks in the first isolation sprints.
- Not breaking ALODILA staff or owner-portal workflows during migration.

### 1.4 Compatibility principle

Every migration step must leave ALODILA usable as today:

- Same core URLs and personas.
- Existing JWTs continue to work (with additive claims later).
- Existing RLS paths remain valid until replaced behind additive policies.
- Default company = ALODILA for all current rows.

---

## 2. Multi-Tenant Strategy

### 2.1 Chosen strategy: Shared database, shared schema, row-level tenancy

| Option | Decision |
|--------|----------|
| Database-per-tenant | Rejected for v1 (ops cost, backup complexity) |
| Schema-per-tenant | Rejected for v1 |
| **Shared DB + `company_id` on tenant data** | **Selected** |

Rationale: Matches current Supabase deployment, existing backup model, and incremental RLS evolution. Fits one Vite SPA + one project.

### 2.2 Tenancy key

- Canonical tenant key: **`company_id` (UUID)** referencing `companies.id`.
- Every business row that can hold customer data is company-scoped (directly or by enforced parent).
- Prefer **denormalized `company_id`** on high-traffic tables (contracts, invoices, payments) for RLS performance and safety.

### 2.3 What “tenant” means (terminology)

| Term | Meaning |
|------|---------|
| **Company** | SaaS customer / operator (tenancy root) |
| **Company Login** | The **single** Auth user that operates that company’s PMS (MVP) |
| **CRM Owner** (`owners`) | Property owner client of that company (existing concept) |
| **Owner Portal User** | Auth user linked to a CRM `owners` row (read-only) |
| **Platform Super Admin** | Platform operator (ALODILA SaaS control plane) — not a company login |

Do not conflate CRM “owner” with SaaS “company.”  
Do not conflate Platform Super Admin with the ALODILA company login (they may be separate accounts).

### 2.4 MVP account model

```
Platform Super Admin account(s)  →  platform control plane
Company account (1 per company)  →  that company’s full ops dashboard
Owner Portal account             →  read-only portfolio for one CRM owner
```

**Post-MVP (explicitly out of scope now):** company_members, invites, multiple staff seats, per-seat roles inside a company.

### 2.5 Isolation depth (defense in depth)

1. **JWT / session** carries persona + `company_id` (for company login) or `owner_crm_id` (for owner portal), set by trusted paths.
2. **Application** every list/get/mutate for company data filters by company.
3. **RLS** every policy requires company match (or platform super admin).
4. **Unique constraints** become composite `(company_id, …)`.

---

## 3. Companies Model

### 3.1 Core entity (MVP)

**Company**

- Identity, display name, status (`active` / `suspended` / `provisioning`)
- Timestamps, soft-delete consistent with platform norms
- Optional later: slug, country, branding
- **Binding to Auth (MVP):** exactly one login account owns/operates the company  
  (conceptual link: `companies.auth_user_id` → `auth.users.id`, or equivalent single FK / unique claim — exact physical shape deferred to implementation approval)

**No `company_members` table in MVP.**

**Default company**

- Seed/backfill: **ALODILA Company**
- All existing `owners`, `properties`, `tenants`, and descendants receive this `company_id`
- Production ALODILA data remains the same rows — only annotated with tenancy
- ALODILA’s existing operator Auth user(s) are mapped carefully so production access continues (Platform Super Admin and/or the single ALODILA company login — product mapping at implementation time, without deleting data)

### 3.2 Relationship to existing ownership columns

Keep during transition:

| Column | Future role |
|--------|-------------|
| `properties.owner_id` | Legacy “creating auth user”; deprecate for authorization over time |
| `properties.owner_crm_id` | Remains CRM owner link for owner portal |
| `company_id` | Primary tenancy boundary |

Owner portal continues to filter by `owner_crm_id`, **and** must also enforce the same `company_id` as that owner’s company.

### 3.3 Tables that become company-scoped

- `owners`, `properties`, `units`, `meters`, `tenants`, `contracts`, `invoices`, `payments`, `maintenance_requests`
- New (MVP): `companies` (+ later `subscriptions` / plans)
- **Not in MVP:** `company_members`

### 3.4 Platform-level concepts

- `auth.users` (identity)
- Platform Super Admin designation
- Future platform billing catalog / plans
- Contaminant unused tables: quarantine — do not give them ALODILA `company_id`

---

## 4. Super Admin Model

### 4.1 Personas (MVP)

| Persona | Scope | Powers |
|---------|--------|--------|
| **Platform Super Admin** | Entire SaaS | Create/suspend companies, bind company login, platform settings, audited break-glass into a company context |
| **Company Login** | Exactly one company | Full PMS ops for that company (properties, units, tenants, contracts, finance, maintenance, CRM owners) — equivalent to today’s staff console scoped to one tenant |
| **CRM Owner (portal)** | Subset of one company’s properties | Read-only portfolio |

There is **no** separate “Company Staff” seat in MVP: the company login *is* the operator.

### 4.2 Rules

- Platform Super Admin is not “logged in as every company” by default.
- Platform Super Admin bypasses company RLS only through an explicit helper (e.g. platform super admin check), used for control-plane and break-glass.
- A Company Login must **never** see another company’s data.
- Today’s inconsistent `is_super_admin()` (claim path / metadata / possible hard-coded email) must be normalized **before** multi-company go-live.

### 4.3 Break-glass

- Support access to a customer company is time-boxed, explicit, and audited (platform assume-company).
- No silent global portfolio SELECT for ordinary company logins after SaaS cutover.

---

## 5. Authentication Strategy

### 5.1 Keep Supabase Auth

Supabase Auth remains the only identity provider for MVP.

Three login **personas** share one Auth project but are distinguished by **trusted claims** and **routing**.

Trusted claims live in `app_metadata` (set only by service role / controlled provisioning — not editable by the end user):

| Claim | Used by |
|--------|---------|
| `role = platform_super_admin` | Super Admin login |
| `role = company` + `company_id` | Company login |
| `role = owner` + `owner_crm_id` (+ `company_id`) | Owner Portal login |

### 5.2 Super Admin login

**Purpose:** Operate the SaaS control plane (companies, platform health, break-glass).

**How login works**

1. User signs in with email/password (or existing ALODILA admin account after claim normalization).
2. Session JWT includes `role = platform_super_admin` (trusted metadata).
3. Application detects platform super admin via role helper.
4. User is **not** treated as a normal company operator unless they explicitly enter an audited company context.

**Capabilities after login**

- Platform dashboard (company list, status, provisioning).
- Create/suspend companies; bind or rotate the single company login.
- Optional: enter a specific `company_id` context for support (audited).
- Must not rely on a hard-coded email alone once multi-company exists.

**Routing**

- Authenticated + `platform_super_admin` → **Platform Super Admin dashboard** (new control-plane routes).
- If the same human also needs day-to-day ALODILA ops, MVP preference is a **separate Company Login** for ALODILA, or an explicit “Enter ALODILA company” action — not implicit full-portfolio staff mode without company context.

### 5.3 Company login

**Purpose:** Run one company’s entire PMS (today’s staff console, scoped).

**MVP rule:** **One Company = One Login.**

**How login works**

1. Company operator signs in with the email/password provisioned for that company.
2. Session JWT includes `role = company` and exactly one `company_id`.
3. Application binds the session to that company for all reads/writes.
4. There is no membership lookup and no company picker.

**Capabilities after login**

- Full ops UI: properties, units, tenants, contracts, finance, maintenance, CRM owners, reports, smart import, AI (scoped).
- Cannot access other `company_id` values.
- Cannot access Platform Super Admin control plane.

**Provisioning**

- When a Company is created, platform provisions (or binds) exactly one Auth user and sets claims.
- Rotating the company login is a platform/admin operation (replace binding), not self-serve multi-seat invite.

**Routing**

- Authenticated + `role = company` + `company_id` → **Company Ops dashboard** (`DashboardLayout` / staff tree), with all data access filtered by that `company_id`.

### 5.4 Owner Portal login

**Purpose:** Read-only view for a CRM property owner (existing portal).

**How login works**

1. Owner identifies with National ID (existing zero-touch style flow).
2. System resolves CRM `owners` row **within a company** (no global cross-company NID oracle in multi-tenant end state).
3. Auth user is created/signed in with synthetic email pattern; claims include `role = owner`, `owner_crm_id`, and `company_id`.
4. Portal remains read-only.

**Capabilities after login**

- Owner routes only: dashboard, properties, reports, maintenance as today.
- Sees only properties linked via `owner_crm_id` for that owner, and only inside their `company_id`.
- No ops mutations; no platform access; no other companies.

**Routing**

- Authenticated + `role = owner` + `owner_crm_id` → **Owner Portal** (`OwnerLayout` / `/owner/*`).
- Any attempt to open staff or platform routes redirects back to `/owner`.

### 5.5 Dashboard routing (end-to-end)

After `getSession` / `onAuthStateChange`:

```
No session
  → Login screen (persona tabs or unified login that classifies after auth)

Session present
  ├─ role = platform_super_admin
  │    → Platform Super Admin dashboard
  │
  ├─ role = company  AND  company_id present
  │    → Company Ops dashboard (scoped to company_id)
  │
  ├─ role = owner  AND  owner_crm_id present
  │    → Owner Portal
  │
  └─ Unrecognized / incomplete claims
       → Safe failure: sign out or blocked screen
         (during transition only: legacy ALODILA staff may default to ALODILA company_id)
```

**Mutual exclusion (MVP)**

- A session maps to **one** primary dashboard persona.
- Owner sessions never receive company write APIs.
- Company sessions never receive platform company-list APIs.
- Platform sessions do not silently load unscoped PMS data without an explicit company context.

### 5.6 Backward compatibility during transition

- Until cutover, missing `company_id` on legacy operator sessions implies **ALODILA**.
- Existing owner detection (`role = owner` + `owner_crm_id`) remains.
- Align app helpers and RLS on the **same** claim path before enabling a second company.
- Remove reliance on a single hard-coded admin email as the sole write gate.

### 5.7 Explicitly deferred (post-MVP)

- Multiple logins per company
- Company memberships / invites / seat roles
- Users belonging to multiple companies
- Self-serve team management

---

## 6. Subscription Architecture

### 6.1 Principles

- Subscription belongs to a **Company**, not to a CRM owner.
- In MVP, the billable “seat” is the **single company login**, plus owner-portal usage limits if needed later.
- Billing provider is an integration boundary — not the source of tenancy.

### 6.2 Conceptual model

- **Plan** — catalog (Free / Pro / Enterprise, etc.)
- **Subscription** — company ↔ plan, status (`trialing`, `active`, `past_due`, `canceled`), period dates
- **Entitlements** — limits (properties, units, AI, owner portal accounts)

### 6.3 Phasing

| Phase | Subscription work |
|-------|-------------------|
| Isolation sprints | Stub: every company `active` on internal/enterprise plan; ALODILA grandfathered |
| Commercialization | Billing provider; webhooks update status |
| Enforcement | Soft limits first, then hard limits |

### 6.4 ALODILA

- ALODILA Company subscription is internal / complimentary / enterprise.
- Never block ALODILA production ops due to billing experiments.
- Never delete ALODILA data for non-payment logic.

---

## 7. Data Isolation Strategy

### 7.1 Row-level rules

Read/write allowed iff:

- Platform Super Admin (explicit control-plane / break-glass), or
- Company login: row `company_id` = session `company_id`, or
- Owner portal: `owner_crm_id` match **and** same `company_id`.

### 7.2 Constraint strategy

- Composite uniqueness per company (national IDs, etc.).
- Secondary units must not reference units outside the contract’s company.

### 7.3 Application strategy

- Company ops shell always has exactly one `company_id` from the session.
- All company data modules require that scope (default ALODILA during transition).
- AI context for company login loads only that company.
- Exports/PDFs inherit the same scope.

### 7.4 Owner portal

- Remains read-only.
- Bound to one CRM owner inside one company.

### 7.5 What must never happen

- Unscoped selects of contracts/invoices/payments after multi-company launch.
- Treating Platform Super Admin as the normal path for day-to-day company ops without context.
- Deleting or re-parenting ALODILA rows to “make room” for SaaS.
- Introducing multi-seat memberships before MVP isolation is proven.

---

## 8. Migration Roadmap

Incremental, backward compatible, ALODILA-preserving, **membership-free MVP**.

### Phase 0 — Preconditions

- Production backup + restore drill.
- Schema source-of-truth reconciliation.
- Normalize Platform Super Admin claim evaluation.
- Contaminant table quarantine plan.
- Clear secondary-unit / global NID / unscoped AI debts that block isolation.

### Phase 1 — Tenancy foundation (additive)

- Introduce `companies` (no memberships).
- Create **ALODILA Company**.
- Bind exactly one company login model (design → implement later).
- Backfill `company_id` on all existing business rows → ALODILA.
- Behavior unchanged for single company.

### Phase 2 — Soft enforcement

- App queries filter by company (ALODILA default).
- Composite unique plan after duplicate audit.
- Additive RLS company predicates.

### Phase 3 — Persona routing hardening

- Explicit routing: Platform Super Admin vs Company login vs Owner Portal.
- Company-scoped owner onboarding.
- Claim alignment complete.

### Phase 4 — Multi-company capability

- Second company on clone/staging first.
- Provision one login per new company.
- Hard cut legacy unscoped paths.
- **No** company switcher (not needed: one login → one company).

### Phase 5 — Commercial layer

- Plans, subscriptions, entitlements, billing design.
- Soft then hard limits.

### Phase 6 — Hardening

- Deprecate legacy `owner_id`-only authz reliance.
- Structural secondary-units integrity.
- RLS tests; audited platform assume-company.
- **Post-MVP gate:** only then consider multi-seat memberships.

---

## 9. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| RLS rewrite locks out writes | Critical | Fix claims before policy cutover; test on clone |
| Cross-tenant leak via unscoped queries | Critical | Mandatory company filter + RLS |
| Global NID uniqueness blocks second company | High | Composite uniques after duplicate scan |
| Owner onboarding as cross-tenant oracle | High | Scope before public multi-tenant signup |
| Secondary units cross-company attach | High | Company checks; later structural fix |
| ALODILA data accidental delete/reassign | Critical | Zero Data Loss + approval gates |
| Confusing Platform Super Admin with company login | High | Separate personas and routes |
| Single company login is a bus-factor / recovery risk | Medium | Document credential rotation; platform re-bind flow |
| AI leaking other companies | High | Scope AI early |
| Subscription enforcement blocking ALODILA | High | Grandfather internal plan |
| Scope creep into memberships mid-MVP | High | Principles: One Company = One Login |
| Schema/repo drift | High | Live schema pack before Phase 1 |

---

## 10. Recommended Sprint Plan

**No sprint modifies ALODILA business facts without explicit request.**  
**No sprint introduces company memberships.**

### Sprint 0 — Safety & truth

- Backup restore procedure signed off.
- Live vs repo schema inventory.
- Super Admin claim alignment design.
- Contaminant table decision.
- **Exit:** go / no-go for Phase 1.

### Sprint 1 — Company foundation — **COMPLETED** (2026-08-04)

- Finalized `companies` fields + **single auth user binding** (no members table).
- Executed `migrations/004_platform_companies.sql` (additive; existing PMS tables untouched).
- Seeded ALODILA company (`slug=alodila`, fixed UUID; `auth_user_id` unbound).
- **Exit met:** approved data model + live `public.companies` + rollback plan documented.
- Details: `docs/SPRINT1_TECHNICAL_DESIGN.md`.

### Sprint 2 — Platform Administration (Super Admin control plane) — **COMPLETED** (2A+2B+2C)

- Build Platform Super Admin UI on existing `public.companies` only.
- Companies CRUD lifecycle: create, edit, suspend/activate, soft-delete, details.
- Subscription + login-binding + modules **placeholders** (read-only); no Auth/RLS/`company_id` changes.
- **Exit met:** Super Admin can manage company registry; PMS behavior unchanged.
- Details: `docs/SPRINT2_PLATFORM_ADMIN_DESIGN.md`.
- Phase 2A: `docs/SPRINT2A_IMPLEMENTATION_BLUEPRINT.md`
- Phase 2B: `docs/SPRINT2B_IMPLEMENTATION_BLUEPRINT.md`

### Sprint 3 — Additive tenancy foundation — **COMPLETED**

- Live discovery (3A) + execution plan (3B) approved.
- **Package 1 (owners, tenants) — COMPLETED** 2026-08-04 · migration `package_1_crm_roots` (`20260804164018`) · smoke passed.
- **Package 2 (properties) — COMPLETED** 2026-08-04 · migration `package_2_properties` (`20260804170440`) · validation passed · smoke passed · production OK.
- **Package 3 (units, meters) — COMPLETED** 2026-08-04 · migration `package_3_units_meters` (`20260804172550`) · validation passed · smoke passed.
- **Package 4 (contracts) — COMPLETED** 2026-08-04 · migration `package_4_contracts` (`20260804173302`) · validation passed · smoke passed.
- **Package 5 (invoices, payments, maintenance_requests) — COMPLETED** 2026-08-04 · migration `package_5_finance_operational` (`20260804174954`) · validation passed · smoke pending.
- **Exit met (DDL):** production behaves as today; `company_id` present on all PMS core tables (nullable; NOT NULL / RLS = Sprint 4).
- Details: `docs/SPRINT3_TENANCY_EXECUTION.md`.
- Sprint 4 docs: `docs/SPRINT4_SHARED_ADAPTER.md`, `docs/SPRINT4_APP_INVENTORY.md`, `docs/SPRINT4_RLS_DESIGN.md`, `docs/SPRINT4_STREAM_D_PACKAGE.md`, `docs/SPRINT4_ISOLATION_QA.md`.

### Sprint 4 — Soft RLS + app filters — **APP COMPLETE / 006 V2 AUTHORED (clone missing)**

- **Stream A–C + UPDATE gates** — COMPLETE (`src/lib/tenancy/**`, `src/lib/db/*`).
- **Policy inventory** — `docs/SPRINT4_RLS_POLICY_INVENTORY.md` (live names).
- **Soft RLS** — apply **`006_sprint4_soft_rls_v2.sql`** + **`006b_…_concurrent.sql`** only; V1 superseded.
- **JWT model** — `docs/SPRINT4_JWT_CLAIM_MODEL.md` (`app_metadata` authz).
- **Clone** — **DOES NOT EXIST**; stand-up guide: `docs/SPRINT4_CLONE_STANDUP.md`.
- **Prod readiness** — `docs/SPRINT4_PRODUCTION_READINESS.md` (gated on clone isolation PASS).
- **Architecture challenge** — `docs/SPRINT4_ARCHITECTURE_CHALLENGE.md`.
- **Exit (pending):** create clone → apply V2 → isolation PASS → production soft RLS approval.
- **Optimized execution:** follow `docs/ROADMAP_OPTIMIZED_V2.md` Gates A–D (Auth bind pulled into Gate A). Next action: `docs/GATE_A_EXECUTION_CHECKLIST.md`.

### Sprint 5 — Auth personas & routing — **PLAN AUTHORED (merged into Gate A)**

- Plan: `docs/SPRINT5_AUTH_CUTOVER_PLAN.md`
- Implement/finalize routing matrix: Super Admin / Company / Owner.
- Company-scoped owner onboarding design→build as approved.
- Document ALODILA login mapping; real login binding (replaces Sprint 2 placeholders).
- **Exit:** persona routing tested; ALODILA unaffected — **execution via Gate A bind**.

### Sprint 6 — Isolation debt — **PLAN AUTHORED (fold blockers into Gate B)**

- Plan: `docs/SPRINT6_ISOLATION_DEBT_PLAN.md`
- Secondary-unit isolation gaps.
- Occupancy safety.
- Unique constraint cutover.
- **Exit:** isolation debt cleared — prefer Gate B hard cutover.

### Sprint 7 — Multi-company beta — **PLAN AUTHORED (Gate C)**

- Plan: `docs/SPRINT7_BETA_ASSUME_COMPANY_PLAN.md`
- Provision second company + **one** login on staging.
- Optional pilot.
- Audited platform assume-company.
- **Exit:** beta criteria met.

### Sprint 8 — Subscription stub

- Internal plans; ALODILA grandfathered.
- Billing architecture RFC (no forced enforcement).
- **Exit:** commercial design approved.

### Sprint 9 — Hardening & docs

- Remove temporary legacy paths only when safe.
- Runbooks + RLS tests.
- **Exit:** Architecture v1 Accepted; post-MVP backlog may list multi-seat memberships.

---

## Governance

- **Production ALODILA data:** immutable unless explicitly requested.
- **Destructive operations:** require written approval.
- **MVP account rule:** One Company = One Login; memberships are out of scope.
- **This document:** DRAFT until approval.
- **Next step after approval:** Sprint 0 execution plan only.

---

## Document control

| Field | Value |
|-------|--------|
| Version | 1.1 DRAFT (revised) |
| Changes in this revision | Removed company memberships from MVP; expanded Authentication + routing; added Platform Principles |
| Implementation | Not started — awaiting approval |

---

*End of Platform Architecture v1*
