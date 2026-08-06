# Sprint 4 — Soft RLS & Isolation Design

**Product:** ALODILA-PMS  
**Document type:** Design only (no SQL, no app code, no production changes)  
**Status:** DRAFT — awaiting approval  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Governing docs:** `PLATFORM_ARCHITECTURE_V1.md` · `SPRINT3_TENANCY_EXECUTION.md`  
**Prerequisite:** Sprint 3 Package 5 closed (`company_id` present + backfilled on all in-scope PMS tables; still **nullable**)

---

## 0. Purpose & posture

Sprint 4 introduces **soft (additive) company isolation** on top of Sprint 3’s tenancy columns.

Goals:

1. Company logins cannot read or write another company’s rows.
2. Owner portal stays read-only and portfolio-scoped; add company alignment without breaking today’s JWT paths.
3. `is_super_admin()` continues to authorize Platform Admin and legacy ALODILA operator writes during transition.
4. Production behavior for the single live company (ALODILA) remains usable after soft policies land.
5. Prove isolation on a **two-company clone** before any production hard cutover.

Non-posture:

- This sprint does **not** set `NOT NULL` on `company_id`.
- This sprint does **not** replace existing policies in one irreversible rewrite.
- This sprint does **not** implement Auth persona cutover (Sprint 5) or isolation debt fixes (Sprint 6).

---

## 1. Soft RLS definition

**Soft RLS** means:

| Rule | Meaning |
|------|---------|
| Additive | New helpers and predicates are added; existing `is_super_admin()` and owner-portal branches stay valid |
| Fail-open for legacy ALODILA ops (transition) | Sessions without a company claim still resolve to ALODILA so current staff/super_admin flows keep working |
| Fail-closed for multi-company proof | On clone, a company-scoped session must never see Company B rows |
| Nullable-tolerant | Rows with `company_id IS NULL` are treated as **not yet tenant-tagged**; soft policies must not strand ALODILA operators, but must not invent a second-tenant leak path |
| Reversible | Policies can be disabled / helpers can default to ALODILA without data migration |

**Hard RLS** (later, not this sprint): require non-null `company_id`, drop legacy unscoped paths, enforce claim completeness for every ops session.

---

## 2. `current_company_id()`

### 2.1 Role

Canonical session → company resolver used by RLS helpers and (later) app filters. Single source of truth for “which company is this request operating as?”

### 2.2 Resolution order (design)

1. **Trusted JWT claim** — `app_metadata.company_id` (preferred; not user-editable).
2. **Fallback claim paths** (transition only) — top-level JWT `company_id`, then `user_metadata.company_id` if still present from early provisioning experiments. Prefer documenting a cutover to `app_metadata` only in Sprint 5.
3. **Owner portal inheritance** — if role is owner and `company_id` claim is missing, resolve from the CRM `owners.company_id` for `current_owner_id()` (read path only; do not invent a company).
4. **Legacy default** — if still unresolved and the session is an allowed ALODILA operator path (`is_super_admin()` or transitional staff), return ALODILA UUID `a1000000-a10d-4000-8000-000000000001`.
5. **Otherwise** — return `NULL` (no company context → deny company-scoped predicates that require a match).

### 2.3 Behavioral contract

| Input | Output |
|-------|--------|
| Valid UUID claim | That UUID |
| Invalid / empty claim text | Treat as missing; continue resolution chain |
| Owner with claim | Claim wins (must match owner’s company in soft checks — see §7) |
| Super admin without assume-company | Prefer **NULL company context for PMS portfolio** unless break-glass sets a context; control-plane (`companies`) remains `is_super_admin()` only |
| Legacy staff / super_admin operating ALODILA today | ALODILA UUID via default |

### 2.4 Stability & safety notes

- Read JWT via `current_setting('request.jwt.claims', true)` — same rule as existing `is_super_admin()` / owner helpers (never `auth.jwt()` alone per project PRD).
- Function is `STABLE`; no table writes.
- Must never trust client-supplied PostgREST filters as a substitute for this helper.
- Do **not** store company in `user_metadata` long-term; Sprint 5 normalizes claims to `app_metadata`.

### 2.5 Explicit non-behavior

- Does not switch companies mid-session (no company switcher in MVP).
- Does not implement platform “assume company” persistence in Sprint 4 (design hook only; audited assume-company is Sprint 7).
- Does not backfill or mutate rows.

---

## 3. Helper functions (design inventory)

All helpers are conceptual; naming should stay aligned with existing `public.is_*` / `public.current_*` style.

### 3.1 Preserve unchanged (contract)

| Helper | Contract in Sprint 4 |
|--------|----------------------|
| `is_super_admin()` | **Preserve.** Continue to gate Platform Admin RLS and current write policies. Claim normalization (e.g. `super_admin` vs `platform_super_admin`) is a dependency for multi-company go-live, not a silent rewrite inside soft RLS. |
| `is_owner_portal_user()` | **Preserve.** Role = owner from app/user metadata. |
| `current_owner_id()` / `current_owner_crm_id()` | **Preserve.** Same JWT resolution order as Phase 10/13. |

### 3.2 New / extended helpers

| Helper | Purpose |
|--------|---------|
| `current_company_id()` | Session company UUID (§2). |
| `is_company_login()` | True when JWT role indicates company operator (`role = company`) **or**, during transition, authenticated non-owner staff that is not exclusively platform-only. Exact role string alignment deferred to Sprint 5; soft RLS must not break today’s `super_admin` staff console. |
| `company_matches(row_company_id)` | True when `row_company_id` equals `current_company_id()`, with soft NULL rules (§5–6). |
| `can_access_company_row(row_company_id)` | Unified gate: `is_super_admin()` **or** `company_matches(...)` **or** (owner path handled separately). |
| `owner_company_aligned(row_company_id)` | Owner portal: owner id matches **and** row company matches session/owner company (soft). |

### 3.3 Soft NULL semantics (shared)

For Sprint 4 soft mode:

- If `row.company_id IS NULL` **and** `current_company_id()` is ALODILA (or legacy default): allow match for ALODILA operator paths only — treats untagged residual rows as ALODILA-era data. After Package 5, residual NULLs should be zero on tagged tables; this is belt-and-suspenders.
- If `row.company_id IS NULL` **and** session company is a **non-ALODILA** company: **deny** (no claim on untagged rows).
- If `row.company_id` is set to Company B and session is Company A: **deny**.
- Never allow Company B session to treat NULL as “my rows.”

### 3.4 Security-definer caution

Prefer `SECURITY INVOKER` / plain `SQL STABLE` helpers that only read JWT + compare UUIDs. Avoid new security-definer functions in `public` that bypass RLS. If a helper must look up `owners.company_id` for owner inheritance, keep it narrow and document the privilege model before implementation.

---

## 4. Policy strategy

### 4.1 Principles

1. **OR-extend, don’t replace** — existing policy bodies keep `is_super_admin()` and owner-portal `EXISTS` branches; company match is added as an additional disjunct / conjunct as appropriate.
2. **Same tables as Sprint 3 scope** — policies that touch tenant data should eventually consider `company_id` on: `owners`, `tenants`, `properties`, `units`, `meters`, `contracts`, `invoices`, `payments`, `maintenance_requests`.
3. **`companies` table unchanged** — remains Super Admin only (`is_super_admin()`). Company logins do not list other SaaS customers.
4. **No DELETE policies** — soft-delete only; unchanged.
5. **SELECT required for UPDATE** — every write table must retain a SELECT path consistent with who can update (Postgres RLS rule).
6. **Defense in depth** — app filters (same sprint family) mirror RLS; RLS is authoritative against forged client filters.

### 4.2 Policy layering (logical)

```
Allow row access if ANY of:

  A. is_super_admin()
       → control-plane + transitional full ALODILA ops writes
       → optional later: require assume-company for cross-tenant support

  B. Company-scoped operator
       → row.company_id matches current_company_id() (soft NULL rules)
       → writes: also require non-deleted insert checks as today

  C. Owner portal (SELECT only)
       → is_owner_portal_user()
       → owner_crm_id / property graph match (existing)
       → AND company alignment (new soft conjunct)

Never: unauthenticated access; hard DELETE.
```

### 4.3 Migration shape (design — not SQL)

For each in-scope table:

1. Keep policy names where possible; edit `USING` / `WITH CHECK` additively.
2. Prefer one SELECT policy per table that ORs A/B/C rather than many overlapping permissive policies that are hard to reason about — **unless** live DB already uses multiple policies; then extend each consistently.
3. Ship helpers first on clone; then policy edits; then app filters; then two-company proof.
4. Production apply only after clone exit criteria pass (§10).

### 4.4 Contaminant / unused tables

Do not extend soft company RLS to quarantined contaminant tables. Do not backfill them to ALODILA. Out of Sprint 4 scope.

---

## 5. Write checks

### 5.1 Who may write (Sprint 4 soft)

| Actor | INSERT | UPDATE (incl. soft-delete) | Notes |
|-------|--------|----------------------------|-------|
| `is_super_admin()` | Yes | Yes | Preserves today’s operator console; Platform Admin remains write-capable on PMS until persona split hardens |
| Company login (`role = company` + company_id) | Yes, own company only | Yes, own company only | Target end-state for ops writes; may land partially in Sprint 4–5 |
| Owner portal | **No** | **No** | Read-only preserved |
| Other authenticated | **No** (unless covered by preserved super_admin path) | **No** | |

### 5.2 INSERT `WITH CHECK` (conceptual)

- `is_deleted = false` (existing).
- And one of:
  - `is_super_admin()`, or
  - company login with `NEW.company_id = current_company_id()` (required when claim present).
- Soft transition: if session defaults to ALODILA, inserted rows should carry ALODILA `company_id` (app default + check). Prefer app always sets `company_id` on insert even while column is nullable.
- Reject inserts where `NEW.company_id` is another tenant’s UUID.
- Reject non-ALODILA company sessions inserting NULL `company_id`.

### 5.3 UPDATE `USING` / `WITH CHECK` (conceptual)

- **USING:** actor may see/target the existing row (super_admin **or** company match soft rules).
- **WITH CHECK:** row after update still belongs to same company (no cross-tenant reassignment via UPDATE).
- Soft-delete (`is_deleted = true`) allowed under same company/super_admin gates.
- Changing `company_id` on an existing row is **forbidden** for company logins; Super Admin reassignment is out of Sprint 4 scope (would be an explicit, audited tool later).

### 5.4 Parent integrity (design intent; hard enforcement may be Sprint 6)

Writes that attach children (unit → property, invoice → contract, secondary units, etc.) must not cross `company_id` boundaries. Sprint 4 soft RLS on denormalized `company_id` columns reduces leak risk; structural secondary-unit debt remains Sprint 6.

### 5.5 Platform `companies` writes

Unchanged: Super Admin only. Not part of PMS soft company predicates.

---

## 6. Read checks

### 6.1 Company-scoped SELECT

Allow when:

- `is_super_admin()`, **or**
- `company_matches(row.company_id)` under soft NULL rules (§3.3), **or**
- owner portal branch (§7).

### 6.2 Graph / EXISTS policies

Today many SELECT policies walk `properties` via `owner_id = auth.uid()` or `owner_crm_id`. Soft company mode:

- Keep those branches for backward compatibility where still needed.
- Prefer denormalized `row.company_id` match for performance on invoices/payments/contracts once columns exist.
- Child tables without a trustworthy direct filter must EXISTS-join to a parent that is company-aligned.

### 6.3 Soft vs hard read posture

| Phase | Cross-company SELECT | Legacy unscoped super_admin SELECT |
|-------|----------------------|------------------------------------|
| Sprint 4 soft (clone proof) | Denied for company sessions | Still allowed via `is_super_admin()` |
| Post Sprint 5–7 | Denied | Super admin portfolio only via audited assume-company |

### 6.4 Exports, AI, reports

Any SELECT-backed export/AI context inherits the same RLS. Soft RLS exit requires verifying AI/report paths cannot load Company B under Company A session (app scope + RLS).

---

## 7. Owner portal flow

### 7.1 Preserve

- JWT: `role = owner` + `owner_crm_id` (app_metadata and/or user_metadata as today).
- Helpers: `is_owner_portal_user()`, `current_owner_id()`.
- Read-only: no INSERT/UPDATE policies for owners.
- Property graph: `properties.owner_crm_id = current_owner_id()`, then units/meters/contracts/invoices/payments/maintenance via existing EXISTS patterns (Phase 10/13).

### 7.2 Soft company addition

Add conjunct (conceptually):

- Owner may read a row only if portfolio match **and** `owner_company_aligned(row.company_id)`.
- Session `company_id` (if present) must equal the CRM owner’s `company_id` and the row’s `company_id`.
- If owner JWT lacks `company_id`, inherit from `owners.company_id` for the current owner id (ALODILA for all live portal users today).

### 7.3 Routing / UX (no implementation here)

- Owner sessions stay on `/owner/*`.
- Must not gain Platform or company-ops write APIs.
- Regression checklist: owner dashboard, properties, reports, maintenance, financial widgets.

### 7.4 Failure modes

| Case | Soft behavior |
|------|----------------|
| Owner claim points at CRM owner in Company A; row tagged Company B | Deny |
| Owner tries staff routes | App redirect (existing); RLS still denies writes |
| Missing owner_crm_id | Deny portal SELECT branches |

---

## 8. Company login flow

### 8.1 Target session shape (MVP)

- `app_metadata.role = company`
- `app_metadata.company_id = <that company’s UUID>`
- Exactly one company per login (no switcher, no memberships).

### 8.2 Soft transition for ALODILA ops

Today production ops writes go through `is_super_admin()`. Sprint 4 must **not** lock out ALODILA:

- Keep super_admin write/read paths.
- Optionally begin accepting company-role sessions with ALODILA UUID for clone tests.
- Binding the real ALODILA company Auth user is Sprint 5 / Platform login-binding work — design only here.

### 8.3 Data access rules

| Operation | Rule |
|-----------|------|
| LIST/GET | Only rows where `company_id` matches session (soft rules) |
| INSERT | Force/check `company_id = current_company_id()` |
| UPDATE | Same company; no re-tenant |
| Platform `/platform` | Deny (client + `companies` RLS) |

### 8.4 App filter alignment (same sprint family)

Every db module used by company ops should pass `company_id` equality (default ALODILA when claim missing during transition). Soft RLS is the backstop when a module forgets the filter.

---

## 9. Super admin flow

### 9.1 Preserve

- `is_super_admin()` remains the Platform Admin gate for `public.companies`.
- Existing PMS policies that allow super_admin SELECT/INSERT/UPDATE remain so ALODILA production console does not break.
- App helper `isSuperAdminUser` continues to detect `role = super_admin` until Sprint 5 claim normalization.

### 9.2 Soft isolation intent

Platform Super Admin is **not** “logged in as every company” for product UX:

- Control plane: company registry only.
- Day-to-day ALODILA portfolio: either continue via current super_admin PMS path (transition) **or** separate ALODILA company login (preferred end-state).
- Cross-tenant support access: **audited assume-company** (Sprint 7) — Sprint 4 only reserves the design hook (optional context claim / setting), does not ship the product feature.

### 9.3 Risk callout

Architecture already flags claim mismatch (`super_admin` vs future `platform_super_admin`, metadata path vs hard-coded email). Soft RLS must not depend on removing `is_super_admin()` until clone tests prove an alternate write path for ALODILA.

---

## 10. Two-company clone strategy

### 10.1 Why clone first

Production has one real tenant (ALODILA). Isolation cannot be proven without a second `company_id` dataset. Clone/staging is mandatory before production soft RLS enablement that could affect live sessions.

### 10.2 Clone preparation

1. Restore production backup to an isolated clone project/branch.
2. Confirm Package 1–5 equivalent state: all in-scope tables have `company_id`, backfilled to ALODILA, FKs present, still nullable.
3. Seed **Company B** in `companies` (new UUID; never reuse ALODILA UUID).
4. Insert a **minimal synthetic dataset** tagged `company_id = Company B`:
   - 1 owner, 1 tenant, 1 property, ≥1 unit, 1 contract, ≥1 invoice/payment as needed for read proofs.
   - No production ALODILA row updates except additive inserts for Company B.
5. Provision two Auth users on clone:
   - **User A:** ALODILA path (existing super_admin and/or company claim = ALODILA UUID).
   - **User B:** `role = company`, `company_id = Company B`.
6. Optional: Owner portal user bound to Company B owner only.

### 10.3 Proof matrix (exit criteria)

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | User B | SELECT properties / contracts / invoices | Only Company B rows |
| 2 | User B | SELECT COUNT on ALODILA-tagged rows | Zero visible |
| 3 | User A | SELECT ALODILA portfolio | Unchanged vs baseline |
| 4 | User A | SELECT Company B rows (without assume-company) | Soft policy choice: deny for pure company-login A; super_admin may still see until hard cut — **document actual clone mode**; target for “zero cross-read” exit is **company-scoped sessions** show zero cross-read |
| 5 | User B | INSERT with `company_id = ALODILA` | Denied |
| 6 | User B | UPDATE ALODILA row | Denied / 0 rows |
| 7 | Owner B | SELECT | Only own portfolio inside Company B |
| 8 | Owner B | SELECT ALODILA owner portfolio | Denied |
| 9 | Non–super-admin | SELECT/INSERT `companies` | Denied |
| 10 | Regression | ALODILA owner portal on clone copy of prod owners | Still works |

**Architecture exit line:** *two-company clone test shows zero cross-read* for company-scoped and owner-scoped sessions.

### 10.4 Rollback on clone

- Revert policy migrations; helpers can remain if inert.
- Drop Company B synthetic rows if needed (clone only).
- Never use clone destructive experiments as a template for production deletes of ALODILA data.

### 10.5 Production gate

Do not enable soft company predicates on production until:

1. Clone matrix passes.
2. ALODILA staff + owner portal smoke passes on clone with production-like claims.
3. Explicit approval for production migration apply.

---

## 11. Non-goals (Sprint 4)

Explicitly out of scope:

| Non-goal | Deferred to |
|----------|-------------|
| `NOT NULL` on `company_id` | Later hardening after audits |
| Hard RLS cutover / removing `is_super_admin()` PMS bypass | Sprint 5–7 |
| Auth claim normalization & persona routing productization | Sprint 5 |
| Real login binding / rotate company Auth user | Sprint 5 / Platform |
| Company memberships, multi-seat, company switcher | Post-MVP |
| Audited assume-company UX | Sprint 7 |
| Composite unique constraints (NID, etc.) | Sprint 6 |
| Secondary-unit structural isolation | Sprint 6 |
| Billing / subscription enforcement | Sprint 8 |
| Contaminant table cleanup or tagging | Quarantine plan |
| Rewriting owner onboarding NID oracle | Sprint 5+ |
| App feature work unrelated to company scope filters | — |
| Any production data delete / re-parent of ALODILA rows | Forbidden |
| SQL implementation in this document | Implementation sprint after approval |

---

## 12. Dependencies & sequencing

```
Package 5 CLOSED (finance/ops company_id live)
        ↓
Sprint 4 DESIGN approved (this document)
        ↓
Clone: helpers → soft policies → app filters
        ↓
Two-company proof matrix PASS
        ↓
Production soft RLS (approved)
        ↓
Sprint 5 Auth personas (harder claim model)
```

Dependency risks:

- `is_super_admin()` claim path must keep working or ALODILA writes freeze.
- Owner JWT dual metadata paths must keep working.
- Package 5 must be closed so finance tables participate in company predicates.

---

## 13. Acceptance summary

Sprint 4 design is accepted when reviewers agree that:

1. `current_company_id()` resolution and soft NULL rules are clear.
2. Helper inventory preserves `is_super_admin` + owner portal.
3. Policy strategy is additive and reversible.
4. Write/read checks prevent cross-tenant mutation/leak for company and owner sessions.
5. Three persona flows (owner / company / super admin) are specified without implementing Auth cutover.
6. Two-company clone strategy defines a concrete zero cross-read exit.
7. Non-goals explicitly defer `NOT NULL`, hard RLS, memberships, and production risk work.

---

## Document control

| Field | Value |
|-------|--------|
| Author role | AGENT 4 — RLS & Isolation Design |
| Deliverable | `docs/SPRINT4_RLS_DESIGN.md` only |
| SQL / code | None |
| ALODILA UUID | `a1000000-a10d-4000-8000-000000000001` |
