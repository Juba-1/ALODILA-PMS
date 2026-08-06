# Sprint 4 — Soft RLS Implementation Checklist

**Product:** ALODILA-PMS  
**Document type:** Ordered implementation checklist (no SQL bodies, no application code)  
**Status:** DRAFT — execute only after `SPRINT4_RLS_DESIGN.md` approval  
**Source of truth:** `docs/SPRINT4_RLS_DESIGN.md`  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Governing docs:** `PLATFORM_ARCHITECTURE_V1.md` · `SPRINT3_TENANCY_EXECUTION.md` · `SPRINT4_RLS_DESIGN.md`

---

## How to use this checklist

- Work **in order**: helpers → SELECT → INSERT/UPDATE → clone proof → production gate.
- Check items only when done on the **clone** unless marked production.
- Name helpers and policies exactly as listed; do not invent alternate public names without design amendment.
- Soft RLS is **additive**: extend existing policies; do not replace `is_super_admin()` or owner-portal branches in one cut.
- No `NOT NULL` on `company_id` in this sprint. No contaminant-table RLS. No DELETE policies.

**In-scope PMS tables:** `owners`, `tenants`, `properties`, `units`, `meters`, `contracts`, `invoices`, `payments`, `maintenance_requests`  
**Out of soft company predicates:** `companies` (Super Admin only — unchanged)

---

## 0. Prerequisites (blockers)

- [ ] Sprint 3 Package 5 closed: all in-scope tables have `company_id`, backfilled to ALODILA, FKs present, still **nullable**
- [ ] `SPRINT4_RLS_DESIGN.md` reviewed and approved
- [ ] Isolated clone / staging project available (restore from production backup)
- [ ] Clone confirmed at Package 1–5 equivalent state (columns + ALODILA backfill; nullable)
- [ ] Baseline smoke recorded on clone: ALODILA staff console + ALODILA owner portal (pre-policy change)
- [ ] Inventory existing live RLS policy names per in-scope table (extend in place where possible)

---

## Phase 1 — Helpers (ship first on clone)

### 1.1 Preserve unchanged (verify before adding anything)

- [ ] Confirm `is_super_admin()` still gates Platform Admin and transitional ALODILA ops writes
- [ ] Confirm `is_owner_portal_user()` still resolves owner role from JWT metadata
- [ ] Confirm `current_owner_id()` / `current_owner_crm_id()` resolution order unchanged (Phase 10/13)
- [ ] Confirm JWT reads use `current_setting('request.jwt.claims', true)` — same rule as existing helpers

### 1.2 Add new helpers (conceptual inventory — implement in this order)

- [ ] **`current_company_id()`** — session → company UUID resolver
  - [ ] Resolution order: `app_metadata.company_id` → top-level JWT `company_id` → `user_metadata.company_id` (transition) → owner inheritance via `owners.company_id` + `current_owner_id()` when role is owner and claim missing → legacy ALODILA default for allowed operator paths → else `NULL`
  - [ ] Invalid / empty claim text treated as missing (continue chain)
  - [ ] `STABLE`; JWT-only compare where possible; no row mutation
  - [ ] Prefer `SECURITY INVOKER` / plain SQL STABLE; if owner inheritance needs table lookup, keep narrow and document privilege model first
- [ ] **`is_company_login()`** — true for company operator role (and transitional non-owner staff that is not platform-only); must not break today’s `super_admin` staff console
- [ ] **`company_matches(row_company_id)`** — equality with soft NULL rules (§1.3)
- [ ] **`can_access_company_row(row_company_id)`** — `is_super_admin()` **or** `company_matches(...)` (owner path separate)
- [ ] **`owner_company_aligned(row_company_id)`** — owner id match **and** soft company alignment

### 1.3 Soft NULL semantics (encode in helpers; verify with unit-style SQL probes on clone — results only, no policy SQL yet)

- [ ] NULL row + session ALODILA (or legacy default) → allow for ALODILA operator paths only
- [ ] NULL row + non-ALODILA session company → **deny**
- [ ] Row Company B + session Company A → **deny**
- [ ] Never allow Company B session to treat NULL as “my rows”

### 1.4 Helper exit gate

- [ ] Helpers deployed on clone and callable under Auth sessions
- [ ] No new security-definer helpers in `public` that bypass RLS unless explicitly documented and approved
- [ ] Super admin without assume-company: portfolio behavior documented (NULL vs ALODILA default) before policies land

---

## Phase 2 — SELECT policies (OR-extend, don’t replace)

### 2.1 Strategy checklist

- [ ] Keep existing policy names where possible; edit `USING` additively
- [ ] Prefer one coherent SELECT policy per table that ORs layers A/B/C — **or**, if live DB already has multiple permissive policies, extend **each** consistently
- [ ] Layer A: `is_super_admin()`
- [ ] Layer B: company-scoped operator via `company_matches` / `can_access_company_row`
- [ ] Layer C: owner portal SELECT only — existing portfolio graph **and** `owner_company_aligned`
- [ ] `companies` SELECT unchanged — `is_super_admin()` only
- [ ] Do not extend soft company RLS to quarantined contaminant tables

### 2.2 Per-table SELECT (in-scope)

For each table below: extend SELECT so company sessions see only matching rows; owners keep portfolio + company alignment; super_admin transitional access preserved.

| Table | SELECT done | Notes |
|-------|-------------|--------|
| `owners` | [ ] | Prefer denormalized `company_id` match; owner branch if applicable |
| `tenants` | [ ] | Soft NULL rules apply |
| `properties` | [ ] | Owner graph: `owner_crm_id` / existing EXISTS **plus** company alignment |
| `units` | [ ] | Direct `company_id` or EXISTS to company-aligned parent |
| `meters` | [ ] | Direct `company_id` or EXISTS to company-aligned parent |
| `contracts` | [ ] | Prefer denormalized `company_id` once present |
| `invoices` | [ ] | Prefer denormalized `company_id`; child EXISTS only if needed |
| `payments` | [ ] | Prefer denormalized `company_id`; child EXISTS only if needed |
| `maintenance_requests` | [ ] | Direct match or EXISTS to aligned property/owner graph |

### 2.3 SELECT-specific gates

- [ ] Every write-capable table still has a SELECT path consistent with who can update (Postgres RLS requirement)
- [ ] Graph / EXISTS branches retained for backward compatibility where still needed
- [ ] Child tables without trustworthy direct filter EXISTS-join only to a **company-aligned** parent
- [ ] Unauthenticated access still denied
- [ ] Smoke: ALODILA staff SELECT baseline unchanged on clone after SELECT edits
- [ ] Smoke: ALODILA owner portal SELECT still works on clone copy of prod owners

---

## Phase 3 — INSERT / UPDATE policies (writes; owners stay read-only)

### 3.1 Actor rules (confirm before editing)

- [ ] `is_super_admin()` — INSERT yes, UPDATE (incl. soft-delete) yes
- [ ] Company login (`role = company` + company claim) — INSERT/UPDATE own company only
- [ ] Owner portal — **no** INSERT, **no** UPDATE
- [ ] Other authenticated — no (unless covered by preserved super_admin path)
- [ ] Platform `companies` INSERT/UPDATE — Super Admin only; unchanged; not part of PMS soft predicates
- [ ] No DELETE policies added or required (soft-delete only)

### 3.2 INSERT `WITH CHECK` (conceptual checklist)

Apply additively on each in-scope write table:

- [ ] Keep existing `is_deleted = false` (or equivalent) checks
- [ ] Allow when `is_super_admin()` **or** company login with `NEW.company_id = current_company_id()` when claim present
- [ ] Reject inserts where `NEW.company_id` is another tenant’s UUID
- [ ] Reject non-ALODILA company sessions inserting NULL `company_id`
- [ ] Soft transition: ALODILA-default sessions should insert rows carrying ALODILA `company_id` (app default + check)
- [ ] Prefer app always stamps `company_id` on insert even while column remains nullable

**Per-table INSERT:**

| Table | INSERT done |
|-------|-------------|
| `owners` | [ ] |
| `tenants` | [ ] |
| `properties` | [ ] |
| `units` | [ ] |
| `meters` | [ ] |
| `contracts` | [ ] |
| `invoices` | [ ] |
| `payments` | [ ] |
| `maintenance_requests` | [ ] |

### 3.3 UPDATE `USING` / `WITH CHECK` (conceptual checklist)

- [ ] **USING:** actor may target existing row (`is_super_admin()` **or** company match soft rules)
- [ ] **WITH CHECK:** post-update row still same company (no cross-tenant reassignment)
- [ ] Soft-delete (`is_deleted = true`) allowed only under same company / super_admin gates
- [ ] Company logins **forbidden** from changing `company_id` on existing rows
- [ ] Super Admin company reassignment **out of Sprint 4** (no audited re-tenant tool in this sprint)
- [ ] Parent integrity intent noted: child attaches must not cross company boundaries (hard structural enforcement may be Sprint 6)

**Per-table UPDATE:**

| Table | UPDATE done |
|-------|-------------|
| `owners` | [ ] |
| `tenants` | [ ] |
| `properties` | [ ] |
| `units` | [ ] |
| `meters` | [ ] |
| `contracts` | [ ] |
| `invoices` | [ ] |
| `payments` | [ ] |
| `maintenance_requests` | [ ] |

### 3.4 Write exit gate (before clone matrix)

- [ ] Owner sessions cannot INSERT or UPDATE any in-scope PMS table
- [ ] Company B session cannot INSERT with ALODILA `company_id`
- [ ] Company B session cannot UPDATE ALODILA-tagged rows (0 rows / denied)
- [ ] ALODILA staff / super_admin write path on clone still works (no lockout)
- [ ] App filter alignment tracked in parallel workstream (shared adapter / db modules) — RLS remains authoritative backstop

---

## Phase 4 — Two-company clone test (exit criteria)

### 4.1 Clone preparation

- [ ] Restore production backup to isolated clone
- [ ] Seed **Company B** in `companies` (new UUID; never reuse ALODILA UUID)
- [ ] Insert minimal synthetic Company B dataset: 1 owner, 1 tenant, 1 property, ≥1 unit, 1 contract, ≥1 invoice/payment as needed
- [ ] No production ALODILA row updates except additive Company B inserts on clone
- [ ] Provision **User A:** ALODILA path (existing super_admin and/or company claim = ALODILA UUID)
- [ ] Provision **User B:** `role = company`, `company_id = Company B`
- [ ] Optional: **Owner B** bound to Company B owner only
- [ ] Document clone mode for User A: pure company-login vs super_admin (affects cross-read expectation for row #4)

### 4.2 Proof matrix

| # | Actor | Action | Expected | Pass |
|---|-------|--------|----------|------|
| 1 | User B | SELECT properties / contracts / invoices | Only Company B rows | [ ] |
| 2 | User B | SELECT COUNT on ALODILA-tagged rows | Zero visible | [ ] |
| 3 | User A | SELECT ALODILA portfolio | Unchanged vs baseline | [ ] |
| 4 | User A | SELECT Company B rows (without assume-company) | Company-scoped A: zero cross-read; super_admin may still see until hard cut — **record actual mode** | [ ] |
| 5 | User B | INSERT with `company_id = ALODILA` | Denied | [ ] |
| 6 | User B | UPDATE ALODILA row | Denied / 0 rows | [ ] |
| 7 | Owner B | SELECT | Only own portfolio inside Company B | [ ] |
| 8 | Owner B | SELECT ALODILA owner portfolio | Denied | [ ] |
| 9 | Non–super-admin | SELECT/INSERT `companies` | Denied | [ ] |
| 10 | Regression | ALODILA owner portal on clone copy of prod owners | Still works | [ ] |

**Architecture exit line:** company-scoped and owner-scoped sessions show **zero cross-read**.

### 4.3 Additional clone verifications

- [ ] Owner dashboard / properties / reports / maintenance / financial widgets still work for ALODILA owner
- [ ] Exports, AI, and report SELECT paths cannot load Company B under Company A session
- [ ] Platform `/platform` denied for company login (client + `companies` RLS)
- [ ] Rollback rehearsed on clone: revert policy migrations; helpers may remain if inert; drop Company B synthetic rows if needed (clone only)

### 4.4 Clone exit gate

- [ ] All proof-matrix rows passed (or explicitly waived with documented reason — waivers require design amendment)
- [ ] ALODILA staff + owner portal smoke passed on clone with production-like claims
- [ ] Explicit approval recorded for production soft RLS migration apply

---

## Phase 5 — Production gate (after clone PASS only)

- [ ] Production migration apply approved in writing
- [ ] Soft helpers + policies applied additively (same order: helpers → SELECT → INSERT/UPDATE)
- [ ] ALODILA staff console smoke
- [ ] ALODILA owner portal smoke
- [ ] No `NOT NULL`, no hard cutover, no removal of `is_super_admin()` PMS bypass
- [ ] Rollback plan ready (disable/revert soft policies; helpers can default to ALODILA without data migration)

---

## Explicit non-goals (do not check off as Sprint 4 work)

| Item | Deferred to |
|------|-------------|
| `NOT NULL` on `company_id` | Later hardening |
| Hard RLS / remove `is_super_admin()` PMS bypass | Sprint 5–7 |
| Auth claim normalization & persona productization | Sprint 5 |
| Real login binding / rotate company Auth user | Sprint 5 / Platform |
| Company memberships, multi-seat, switcher | Post-MVP |
| Audited assume-company UX | Sprint 7 |
| Composite unique constraints; secondary-unit structural isolation | Sprint 6 |
| Contaminant table cleanup/tagging | Quarantine plan |
| Any production delete / re-parent of ALODILA rows | Forbidden |

---

## Sequencing reminder

```
Package 5 CLOSED
    → Design approved (SPRINT4_RLS_DESIGN.md)
    → Clone: helpers → SELECT policies → INSERT/UPDATE policies → app filters (parallel)
    → Two-company proof matrix PASS
    → Production soft RLS (approved)
    → Sprint 5 Auth personas
```

---

## Document control

| Field | Value |
|-------|--------|
| Author role | Agent E — Sprint 4 RLS documentation |
| Deliverable | `docs/SPRINT4_RLS_IMPLEMENTATION_CHECKLIST.md` only |
| SQL bodies / app code | None (helper & policy **names** only) |
| Depends on | `docs/SPRINT4_RLS_DESIGN.md` |
