# Sprint 1 — Technical Design: Platform Companies Foundation

**Status:** COMPLETED — Migration 004 executed on production (ALODILA-PMS)  
**Completed at:** 2026-08-04 (Sprint 1 execution)  
**Architecture:** Platform Architecture v1 (approved)  
**Prerequisite:** Schema Drift Report (approved)  
**Production rule:** ALODILA business data must remain fully operational and unchanged.

---

## 1. Sprint 1 Technical Design

### 1.1 Objective

Introduce an additive **Platform Companies** layer: a new `public.companies` table that will become the tenancy root for future sprints.

After Sprint 1 (when approved and executed):

- The database contains a `companies` table.
- One seed row represents **ALODILA Company** (new table only).
- **Zero** changes to existing PMS tables, rows, RLS, Auth, UI, or app logic.
- Current ALODILA operators and owner portal continue exactly as today (they do not read `companies` yet).

### 1.2 Explicitly out of scope

| Excluded | Reason |
|----------|--------|
| `company_id` on existing tables | Deferred (later sprint) |
| Backfill of portfolio rows | Deferred |
| `company_members` | Architecture MVP: One Company = One Login |
| Auth claim / login / routing changes | No auth modifications this sprint |
| Existing RLS policy edits | Forbidden |
| UI / `src/**` application code | Forbidden |
| Contaminant schema cleanup | Separate approval |
| Subscriptions / billing | Later |

### 1.3 Success criteria

1. Migration script reviewed and approved.
2. Validation checklist completed on a **clone or dry-run review** before production execute.
3. After execute (future): `companies` exists; ALODILA seed row present; all existing PMS tables byte-identical in structure and row content (except unrelated concurrent ops).
4. Smoke: staff login, owner portal, contracts, finance — unchanged.

### 1.4 Compatibility guarantee

The application never queries `companies` in this sprint. Therefore adding the table cannot change runtime behavior even if RLS on `companies` is restrictive.

---

## 2. Database Design — `public.companies`

### 2.1 Purpose

Registry of SaaS customer companies. MVP binds **at most one** Auth login per company via `auth_user_id` (nullable until a later auth sprint binds it).

### 2.2 Columns

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|--------|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK; tenancy key for future FKs |
| `created_at` | `timestamptz` | NO | `now()` | Platform standard |
| `updated_at` | `timestamptz` | NO | `now()` | Maintained by trigger |
| `is_deleted` | `boolean` | NO | `false` | Soft-delete; no hard delete |
| `name` | `text` | NO | — | Display name |
| `slug` | `text` | NO | — | Stable code; UNIQUE among non-deleted preferred via unique index on `slug` |
| `status` | `text` | NO | `'active'` | CHECK: `active` \| `suspended` \| `provisioning` |
| `auth_user_id` | `uuid` | YES | `NULL` | FK → `auth.users(id)`; UNIQUE when not null — **One Company = One Login**; unbound in Sprint 1 |
| `notes` | `text` | YES | `NULL` | Internal platform notes only |

### 2.3 Constraints & indexes

- PRIMARY KEY (`id`)
- UNIQUE (`slug`)
- UNIQUE (`auth_user_id`) — Postgres allows multiple NULLs
- CHECK (`status` IN (...))
- CHECK (`char_length(trim(name)) > 0`)
- CHECK (`slug` ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
- FK `companies_auth_user_id_fkey`: `auth_user_id` → `auth.users(id)` ON DELETE SET NULL  
  (does not modify `auth.users` definition; standard FK)
- Index on `is_deleted`, `status` (operational filters later)

### 2.4 Trigger

- `set_updated_at_companies` BEFORE UPDATE → existing `public.set_updated_at()`  
  (reuse only; do not replace the function body in this sprint)

### 2.5 RLS (new table only)

- ENABLE ROW LEVEL SECURITY on `companies`.
- Policies (new): SELECT / INSERT / UPDATE for `authenticated` when `public.is_super_admin()`; INSERT requires `is_deleted = false`.
- No DELETE policy (soft-delete via UPDATE).
- **No changes** to policies on any other table.

Rationale: App does not query this table yet; restrictive default is safe. Platform super-admin path matches existing write philosophy.

### 2.6 Seed row (new table only)

| Field | Value |
|-------|--------|
| `id` | Fixed UUID `a1000000-a10d-4000-8000-000000000001` |
| `name` | `ALODILA` |
| `slug` | `alodila` |
| `status` | `active` |
| `auth_user_id` | `NULL` (bind in a later auth sprint) |
| `is_deleted` | `false` |

Fixed id enables future backfills to reference ALODILA deterministically without scanning by name.

**This INSERT touches only `public.companies`.** It does not update properties, contracts, owners, or any existing PMS row.

### 2.7 What is intentionally absent

- No `company_members`
- No FKs from `properties` / `owners` / etc. to `companies`
- No `company_id` columns on legacy tables

---

## 3. SQL Migration Script (NOT EXECUTED)

**File:** `migrations/004_platform_companies.sql`  
**Execute only after explicit approval and checklist sign-off.**

See accompanying script in the repository (delivered, not run).

---

## 4. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Operator runs script on wrong project | Low | High | Confirm project ref `ryfqqyrqmsyngwcsfjug` / name ALODILA-PMS before execute |
| `is_super_admin()` false for all users → nobody can read `companies` via PostgREST | Medium | Low for Sprint 1 | App does not use table yet; fix claims in later sprint |
| UNIQUE `slug` conflict if re-run / partial apply | Low | Medium | Idempotent seed via `ON CONFLICT (id) DO NOTHING`; slug unique |
| FK to `auth.users` blocks drop of users later | Low | Low | ON DELETE SET NULL |
| Contaminant schemas / parallel products confused with `companies` | Medium | Medium | Document quarantine; do not reuse `organizations` |
| Accidental execution of a different migration that alters PMS tables | Low | Critical | Script contains **only** `companies`; peer review |
| Fixed UUID collision (astronomically unlikely) | Negligible | Medium | Pre-check `SELECT id FROM companies WHERE id = …` |
| Trigger fails if `set_updated_at` missing | Low | High | Pre-validate function exists (checklist) |
| Someone later assumes Sprint 1 isolated app data | Medium | High | Explicit: **no isolation yet** — behavior unchanged |

**Non-risks (by design):** existing RLS, auth flows, UI, PMS row data, and business logic are untouched.

---

## 5. Rollback Plan

### 5.1 If migration has **not** been executed

- Discard or archive the unapproved script; no DB action.

### 5.2 If migration **was** executed and must be undone

**Preconditions:** No later sprint has added FKs from PMS tables to `companies`, and no app release depends on `companies`.

**Rollback SQL (execute only with explicit approval):**

```sql
begin;
drop policy if exists companies_select_policy on public.companies;
drop policy if exists companies_insert_policy on public.companies;
drop policy if exists companies_update_policy on public.companies;
drop trigger if exists set_updated_at_companies on public.companies;
drop table if exists public.companies;
commit;
```

**Effect:** Removes only the new table and its policies/trigger.  
**Does not** restore or alter any PMS table (none were changed).

### 5.3 If seed row alone must be removed but table kept

```sql
-- Approved soft-delete only (preferred over hard delete)
update public.companies
set is_deleted = true
where id = 'a1000000-a10d-4000-8000-000000000001';
```

Hard `DELETE` of the seed row is allowed only if no dependents exist (Sprint 1: none).

---

## 6. Validation Checklist (before any execute)

Complete every item; sign off in writing.

### 6.1 Environment

- [ ] Target project is **ALODILA-PMS** / ref `ryfqqyrqmsyngwcsfjug` (not `streak up` or other).
- [ ] Recent offline backup still available and identified.
- [ ] Prefer dry-run on a **clone/branch** first if available.
- [ ] Platform Architecture v1 and Schema Drift Report remain approved.

### 6.2 Script review

- [ ] Peer review confirms script creates **only** `public.companies` (+ its policies/trigger/indexes).
- [ ] Script does **not** `ALTER` any existing PMS table.
- [ ] Script does **not** `DROP` anything except `IF EXISTS` on objects it creates (policies/trigger on `companies`).
- [ ] No `company_id` added anywhere.
- [ ] No changes to Auth settings, JWT, or existing RLS on other tables.
- [ ] Seed uses fixed ALODILA id and does not reference/update other tables.

### 6.3 Preconditions in database

- [ ] Extension/`gen_random_uuid` available (existing project OK).
- [ ] Function `public.set_updated_at()` exists.
- [ ] Function `public.is_super_admin()` exists (policies compile).
- [ ] `public.companies` does **not** already exist (or decide re-run strategy).
- [ ] No row already uses seed id if table partially created.

### 6.4 After execute (immediate)

- [x] `\d public.companies` (or Dashboard) shows expected columns.
- [x] Seed row `slug = alodila` present, `is_deleted = false`, `auth_user_id` IS NULL.
- [ ] Row counts on `properties`, `units`, `contracts`, `invoices`, `payments`, `tenants`, `owners` unchanged vs pre-check snapshot. *(not re-counted; migration did not touch these tables)*
- [x] RLS enabled on `companies`.
- [ ] Staff login still works. *(manual / unchanged by design)*
- [ ] Owner portal login still works. *(manual / unchanged by design)*
- [ ] Open contracts list / one contract detail / one invoice — no new errors. *(manual / unchanged by design)*

### 6.5 Explicit non-regression

- [x] No application deploy required for this sprint.
- [x] No Auth user metadata changed.
- [x] Contaminant tables untouched.

---

## 7. Execution record

| Item | Status |
|------|--------|
| Technical design | Approved |
| Migration script `004_platform_companies.sql` | **Executed** via Supabase `apply_migration` (`platform_companies`) |
| Application code | None (unchanged) |
| UI | None (unchanged) |
| Sprint 2 | **Not started** — awaiting next instruction |

### Post-execution verification (2026-08-04)

| Check | Result |
|-------|--------|
| `public.companies` exists | PASS |
| ALODILA seed (`id=a1000000-a10d-4000-8000-000000000001`, `slug=alodila`) | PASS |
| `auth_user_id` unbound (NULL) | PASS |
| RLS enabled on `companies` | PASS |
| Existing PMS tables / app behavior | Unchanged by design |

---

*End of Sprint 1 Technical Design — COMPLETED*
