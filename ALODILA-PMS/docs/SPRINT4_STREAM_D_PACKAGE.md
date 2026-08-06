# Sprint 4 — Stream D Soft RLS Implementation Package

**Product:** ALODILA-PMS  
**Document type:** Soft RLS implementation package (ordered phases / gates / risks)  
**Status:** SQL **V2 AUTHORED** (`006_sprint4_soft_rls_v2.sql` + `006b` indexes) — **NOT EXECUTED**; clone **MISSING**; app Streams A–C + UPDATE gates COMPLETE  
**Stream:** **D — Soft RLS**  
**Inventory:** `SPRINT4_RLS_POLICY_INVENTORY.md` · **Do not apply V1**  
**Sources of truth:** `SPRINT4_RLS_DESIGN.md` · `SPRINT4_RLS_IMPLEMENTATION_CHECKLIST.md`  
**Governing:** `PLATFORM_ARCHITECTURE_V1.md` · `SPRINT3_TENANCY_EXECUTION.md`  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Date:** 2026-08-04  

---

## 0. Purpose

Ship **additive (soft) Row Level Security** so company-scoped and owner-scoped sessions cannot cross tenants, while preserving today’s `is_super_admin()` and owner-portal paths for ALODILA.

Soft RLS is the **database backstop** after Streams A–C land app-side tenancy. App filters remain defense in depth; RLS is authoritative against forged client filters.

### 0.1 Stream lettering (canonical)

| Stream | Work | Relation to Stream D |
|--------|------|----------------------|
| **A** | Shared tenancy adapter (`src/lib/tenancy/**`) | **Hard prerequisite** — claim/resolver model must align with `current_company_id()` |
| **B** | Write stamps (`stampInsert` / write-scoped UPDATE / soft-delete) | **Hard prerequisite** — rows must carry `company_id` before policies deny NULL for non-ALODILA |
| **C** | App read filters (`withCompanyEq` / `resolveReadScope`) | **Hard prerequisite** — app SELECT scope must match soft predicates before clone proof |
| **D** | Soft RLS (this package) | Clone first: helpers → SELECT → INSERT/UPDATE → two-company gate → production |

> Older drafts sometimes swapped B/C labels. **Canonical:** B = write stamps, C = read filters, D = soft RLS.

### 0.2 Soft RLS definition (package posture)

| Rule | Meaning |
|------|---------|
| Additive | New helpers + OR-extended policies; keep `is_super_admin()` and owner-portal branches |
| Fail-open for legacy ALODILA ops | Sessions without company claim may resolve to ALODILA during transition |
| Fail-closed for multi-company proof | Company-scoped session must never see Company B ↔ ALODILA cross-rows |
| Nullable-tolerant | Residual `company_id IS NULL` treated as ALODILA-era only for ALODILA operator paths; never for Company B |
| Reversible | Policies can be disabled; helpers may default to ALODILA without data migration |

---

## 1. Prerequisites (block Stream D)

Do **not** open Stream D coding/migrations until all gates below pass.

### 1.1 Sprint 3 / design

- [ ] Sprint 3 Package 5 closed: all in-scope tables have `company_id`, backfilled to ALODILA, FKs present, still **nullable**
- [ ] `SPRINT4_RLS_DESIGN.md` reviewed and approved
- [ ] Isolated clone / staging project available (restore from production backup)
- [ ] Clone at Package 1–5 equivalent state
- [ ] Baseline smoke recorded on clone: ALODILA staff console + ALODILA owner portal (**pre-policy**)
- [ ] Inventory existing live RLS policy names per in-scope table (extend in place where possible)

### 1.2 Stream A done (shared adapter)

- [ ] `resolveReadScope` / `resolveWriteCompany` / `companyDb` / `stampInsert` / `withCompanyEq` / `assertRowInScope` available
- [ ] Persona matrix documented; claim paths align with design §2 (`app_metadata.company_id` preferred)
- [ ] `ALODILA_COMPANY_ID` = `a1000000-a10d-4000-8000-000000000001`

### 1.3 Stream B done (write stamps)

- [ ] All in-scope INSERT paths stamp `company_id`
- [ ] UPDATE / soft-delete omit client `company_id`; write-scoped where required
- [ ] Parent-inheritance checks on child creates
- [ ] Smoke: create under legacy staff → row `company_id = ALODILA`; create-then-list still works

### 1.4 Stream C done (app read filters)

- [ ] In-scope `src/lib/db/*` SELECT paths use `resolveReadScope` + `withCompanyEq` (per Stream C waves)
- [ ] Owner portal reads keep portfolio filters **and** company eq
- [ ] Soft-delete guard SELECTs scoped
- [ ] AI / reports inherit scoped loaders (no parallel unscoped `.from`)
- [ ] Stream C exit: ALODILA staff + owner portal smoke green under filters

### 1.5 Why A → B → C before D

| Gap if skipped | Failure mode under soft RLS |
|----------------|-----------------------------|
| A missing | JWT claim resolution diverges from `current_company_id()` |
| B missing | New rows NULL/`wrong` company → invisible or cross-tenant write holes |
| C missing | App may still “work” while RLS alone is unproven; clone matrix harder to debug |

---

## 2. In-scope / out-of-scope tables

**In-scope PMS tables (soft company predicates):**

`owners` · `tenants` · `properties` · `units` · `meters` · `contracts` · `invoices` · `payments` · `maintenance_requests`

**Unchanged (not soft-company predicates):**

`companies` — Super Admin only (`is_super_admin()`)

**Excluded:** quarantined contaminant tables; no DELETE policies (soft-delete only).

---

## 3. Helper inventory (names only — no SQL)

### 3.1 Preserve unchanged (verify before adding)

| Helper | Contract in Stream D |
|--------|----------------------|
| `is_super_admin()` | Keep gating Platform Admin + transitional ALODILA ops writes |
| `is_owner_portal_user()` | Keep owner role from JWT metadata |
| `current_owner_id()` / `current_owner_crm_id()` | Keep Phase 10/13 resolution order |

JWT reads must continue via `current_setting('request.jwt.claims', true)` (same rule as existing helpers).

### 3.2 New helpers (implement in this order)

| # | Helper | Purpose |
|---|--------|---------|
| 1 | `current_company_id()` | Session → company UUID |
| 2 | `is_company_login()` | Company operator role (transition-safe; must not break `super_admin` console) |
| 3 | `company_matches(row_company_id)` | Equality + soft NULL rules |
| 4 | `can_access_company_row(row_company_id)` | `is_super_admin()` **or** `company_matches(...)` (owner path separate) |
| 5 | `owner_company_aligned(row_company_id)` | Owner portfolio **and** soft company alignment |

### 3.3 `current_company_id()` resolution order (design)

1. `app_metadata.company_id` (preferred)
2. Top-level JWT `company_id` (transition)
3. `user_metadata.company_id` (transition only)
4. Owner inheritance: `owners.company_id` via `current_owner_id()` when role is owner and claim missing
5. Legacy ALODILA default for allowed operator paths (`is_super_admin()` / transitional staff)
6. Else `NULL`

Invalid / empty claim text → treat as missing; continue chain. Function `STABLE`; no row mutation. Prefer `SECURITY INVOKER` / plain SQL STABLE; no new security-definer bypass helpers in `public` unless explicitly approved.

### 3.4 Soft NULL semantics (encode in helpers)

| Row `company_id` | Session company | Result |
|------------------|-----------------|--------|
| NULL | ALODILA / legacy default | Allow for ALODILA operator paths only |
| NULL | Non-ALODILA | **Deny** |
| Company B | Company A | **Deny** |
| NULL | Company B | **Never** treat as “my rows” |

### 3.5 Helper exit gate

- [ ] Helpers deployed on clone and callable under Auth sessions
- [ ] Super admin without assume-company: portfolio behavior documented (NULL vs ALODILA default) **before** policies land
- [ ] No undocumented security-definer helpers that bypass RLS

---

## 4. Policy strategy & order

### 4.1 Principles

1. **OR-extend, don’t replace** — keep `is_super_admin()` and owner-portal branches; add company match as additional disjunct/conjunct
2. Keep existing **policy names** where possible; edit `USING` / `WITH CHECK` additively
3. Prefer one coherent SELECT policy per table that ORs layers A/B/C — **or**, if live DB already has multiple permissive policies, extend **each** consistently
4. SELECT required for UPDATE (Postgres RLS rule)
5. No DELETE policies; `companies` unchanged

### 4.2 Logical layers (any of)

```
A. is_super_admin()
     → control-plane + transitional full ALODILA ops

B. Company-scoped operator
     → company_matches / can_access_company_row (soft NULL rules)
     → writes: existing non-deleted checks + company stamp checks

C. Owner portal (SELECT only)
     → is_owner_portal_user() + existing portfolio graph
     → AND owner_company_aligned(row.company_id)

Never: unauthenticated access; hard DELETE; contaminant-table soft company RLS
```

### 4.3 Ordered apply sequence (clone, then production)

```
Phase D0  Prerequisites A/B/C + Package 5 + design approval
    ↓
Phase D1  Helpers (preserve → add in §3.2 order) + soft NULL probes
    ↓
Phase D2  SELECT policies (OR-extend) — all 9 in-scope tables
    ↓
Phase D3  INSERT / UPDATE policies — same 9 tables; owners stay read-only
    ↓
Phase D4  Two-company clone proof matrix (+ rollback rehearsal)
    ↓
Phase D5  Production gate (approval → same order helpers → SELECT → writes)
```

App filters (Stream C) are already landed; do not regress them while applying D.

### 4.4 Phase D2 — SELECT policy order (per-table)

Apply SELECT extensions in this table order (CRM → portfolio → ops → finance):

| Order | Table | Notes |
|-------|-------|--------|
| 1 | `owners` | Denormalized `company_id`; owner branch if applicable |
| 2 | `tenants` | Soft NULL rules |
| 3 | `properties` | Owner graph **plus** company alignment |
| 4 | `units` | Direct match or EXISTS to company-aligned parent |
| 5 | `meters` | Direct match or EXISTS to company-aligned parent |
| 6 | `contracts` | Prefer denormalized `company_id` |
| 7 | `invoices` | Prefer denormalized `company_id` |
| 8 | `payments` | Prefer denormalized `company_id` |
| 9 | `maintenance_requests` | Direct or EXISTS to aligned property/owner graph |

After D2: smoke ALODILA staff SELECT baseline + ALODILA owner portal on clone.

### 4.5 Phase D3 — INSERT / UPDATE policy order

Same table order as §4.4. Actor rules:

| Actor | INSERT | UPDATE (incl. soft-delete) |
|-------|--------|----------------------------|
| `is_super_admin()` | Yes | Yes |
| Company login (`role = company` + claim) | Own company only | Own company only |
| Owner portal | **No** | **No** |
| Other authenticated | No (unless preserved super_admin path) | No |

**INSERT conceptual checks:** keep `is_deleted = false`; allow super_admin **or** `NEW.company_id = current_company_id()`; reject foreign-tenant UUID; reject non-ALODILA session inserting NULL.

**UPDATE conceptual checks:** USING = may target row; WITH CHECK = same company after update; company logins cannot change `company_id`; no Super Admin re-tenant tool in this sprint.

**Write exit gate (before clone matrix):**

- [ ] Owner cannot INSERT/UPDATE in-scope PMS tables
- [ ] Company B cannot INSERT with ALODILA `company_id`
- [ ] Company B cannot UPDATE ALODILA rows (0 rows / denied)
- [ ] ALODILA staff / super_admin write path still works (no lockout)

---

## 5. Clone-test gate (Phase D4 — exit criteria)

### 5.1 Clone preparation

- [ ] Restore production backup to isolated clone
- [ ] Seed **Company B** in `companies` (new UUID; never reuse ALODILA UUID)
- [ ] Minimal synthetic Company B dataset: 1 owner, 1 tenant, 1 property, ≥1 unit, 1 contract, ≥1 invoice/payment as needed
- [ ] Additive Company B inserts only (no ALODILA re-parent on clone except as needed for seed)
- [ ] **User A:** ALODILA path (super_admin and/or company claim = ALODILA)
- [ ] **User B:** `role = company`, `company_id = Company B`
- [ ] Optional **Owner B** bound to Company B owner only
- [ ] Document User A mode: pure company-login vs super_admin (affects proof row #4)

### 5.2 Proof matrix

| # | Actor | Action | Expected | Pass |
|---|-------|--------|----------|------|
| 1 | User B | SELECT properties / contracts / invoices | Only Company B rows | [ ] |
| 2 | User B | SELECT COUNT on ALODILA-tagged rows | Zero visible | [ ] |
| 3 | User A | SELECT ALODILA portfolio | Unchanged vs baseline | [ ] |
| 4 | User A | SELECT Company B (no assume-company) | Company-scoped A: zero cross-read; super_admin may still see until hard cut — **record mode** | [ ] |
| 5 | User B | INSERT with `company_id = ALODILA` | Denied | [ ] |
| 6 | User B | UPDATE ALODILA row | Denied / 0 rows | [ ] |
| 7 | Owner B | SELECT | Own portfolio inside Company B only | [ ] |
| 8 | Owner B | SELECT ALODILA owner portfolio | Denied | [ ] |
| 9 | Non–super-admin | SELECT/INSERT `companies` | Denied | [ ] |
| 10 | Regression | ALODILA owner portal on clone copy of prod owners | Still works | [ ] |

**Architecture exit line:** company-scoped and owner-scoped sessions show **zero cross-read**.

### 5.3 Additional verifications

- [ ] Owner dashboard / properties / reports / maintenance / financial widgets (ALODILA owner)
- [ ] Exports, AI, report SELECT paths cannot load Company B under Company A session
- [ ] Platform `/platform` denied for company login (client + `companies` RLS)
- [ ] Rollback rehearsed: revert policy migrations; helpers may remain if inert; drop Company B synthetic rows (clone only)

### 5.4 Clone exit gate → production

- [ ] All proof-matrix rows passed (waivers require design amendment)
- [ ] ALODILA staff + owner portal smoke with production-like claims
- [ ] Explicit written approval for production soft RLS apply

---

## 6. Production gate (Phase D5)

Only after §5.4:

- [ ] Soft helpers + policies applied additively in same order: helpers → SELECT → INSERT/UPDATE
- [ ] ALODILA staff console smoke
- [ ] ALODILA owner portal smoke
- [ ] No `NOT NULL`, no hard cutover, no removal of `is_super_admin()` PMS bypass
- [ ] Rollback plan ready (disable/revert soft policies; helpers can default to ALODILA without data migration)

---

## 7. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `is_super_admin()` claim path breaks → ALODILA writes freeze | **Critical** | Preserve helper; verify before policy edits; clone smoke first |
| Stream A claim paths diverge from `current_company_id()` | High | Align with design §2; adapter smoke before D1 |
| Stream B incomplete → NULL inserts invisible / wrong under policies | **Critical** | Hard gate §1.3 |
| Stream C incomplete → hard to separate app-filter bugs from RLS bugs | High | Hard gate §1.4; land C before clone matrix |
| Soft NULL rules leak untagged rows to Company B | High | Encode §3.4; probe helpers before policies |
| Multiple permissive policies extended inconsistently | Medium | Inventory names; extend each or collapse carefully |
| Owner JWT dual metadata paths break | High | Preserve `is_owner_portal_user` / `current_owner_id`; portal regression #10 |
| Super_admin still sees Company B on clone (row #4) | Medium | Document mode; zero cross-read exit targets **company/owner** sessions |
| Security-definer helper bypasses RLS | High | Prefer invoker/STABLE; approve any exception |
| Production apply before clone PASS | **Critical** | Phase D5 blocked on §5.4 |
| Contaminant tables accidentally policy-extended | Medium | Explicit out-of-scope |

---

## 8. Non-goals (Stream D / Sprint 4)

| Non-goal | Deferred to |
|----------|-------------|
| `NOT NULL` on `company_id` | Later hardening |
| Hard RLS / remove `is_super_admin()` PMS bypass | Sprint 5–7 |
| Auth claim normalization & persona productization | Sprint 5 |
| Real login binding / rotate company Auth user | Sprint 5 / Platform |
| Company memberships, multi-seat, switcher | Post-MVP |
| Audited assume-company UX | Sprint 7 |
| Composite unique constraints; secondary-unit structural isolation | Sprint 6 |
| Billing / subscription enforcement | Sprint 8 |
| Contaminant table cleanup / tagging | Quarantine plan |
| Rewriting owner onboarding NID oracle | Sprint 5+ |
| App feature work unrelated to company scope | — |
| Any production data delete / re-parent of ALODILA rows | **Forbidden** |
| SQL bodies or app code in this document | Implementation after approval |

---

## 9. Sequencing diagram

```
Package 5 CLOSED
    → Streams A + B + C DONE
    → Design approved (SPRINT4_RLS_DESIGN.md)
    → Clone: helpers → SELECT → INSERT/UPDATE
    → Two-company proof matrix PASS (zero cross-read)
    → Production soft RLS (approved)
    → Sprint 5 Auth personas (harder claim model)
```

---

## 10. Acceptance summary (Stream D package ready)

Reviewers accept this package when they agree:

1. Prerequisites require Streams **A, B, and C** complete plus Package 5 + design approval  
2. Helper names and order are fixed (`current_company_id` → … → `owner_company_aligned`)  
3. Policy apply order is helpers → SELECT (9 tables) → INSERT/UPDATE (same 9) → clone → production  
4. Soft NULL and OR-extend rules are clear and reversible  
5. Clone proof matrix defines a concrete **zero cross-read** exit for company/owner sessions  
6. Risks and non-goals explicitly defer hard RLS, `NOT NULL`, memberships, and production deletes  

---

## Document control

| Field | Value |
|-------|--------|
| Author role | Sprint D Planning Agent |
| Deliverable | `docs/SPRINT4_STREAM_D_PACKAGE.md` only |
| SQL bodies / app code | **None** (helper & policy **names** / order only) |
| Depends on | `SPRINT4_RLS_DESIGN.md` · `SPRINT4_RLS_IMPLEMENTATION_CHECKLIST.md` · Streams A/B/C exit |
| ALODILA UUID | `a1000000-a10d-4000-8000-000000000001` |

*End of Sprint 4 Stream D Soft RLS Implementation Package*
