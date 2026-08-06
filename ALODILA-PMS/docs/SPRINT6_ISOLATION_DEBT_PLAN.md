# Sprint 6 — Isolation Debt Plan

**Product:** ALODILA-PMS  
**Document type:** Execution plan (docs + SQL **authoring** only — **no SQL execution**)  
**Author role:** Roadmap Planning Agent  
**Date:** 2026-08-04  
**Status:** READY FOR AUTHORING (clone apply gated)  
**Governing sources:** `PLATFORM_ARCHITECTURE_V1.md` · `SPRINT4_ARCHITECTURE_CHALLENGE.md` · `SPRINT4_RLS_DESIGN.md` §5.4 · `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_WRITE_STAMP_CHECKLIST.md` · `SPRINT4_QA_ISOLATION_TEST_PLAN.md`

**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`

---

## 0. Verdict (architecture challenge alignment)

Isolation debt that **blocks a correct second company** is not a philosophy sprint — it belongs on the **shorter hard gate** path:

```
Hard isolation gate (clone): Auth bind (ALODILA company login)
  → zero-NULL proof → company_id NOT NULL
  → strict company RLS (no silent SA PMS bypass)
  → structural blockers in this doc (secondary units, composite uniques, occupancy scope, parent integrity)
THEN: Company B + isolation matrix (Sprint 7)
```

**Do not** keep a long soft-NULL / SA-portfolio season while these items sit in a distant Sprint 6. Prefer folding **blockers** into the clone campaign that proves two tenants; defer only **cosmetic** occupancy polish that does not affect cross-tenant integrity.

This document inventories the debt, specifies the intended fixes, and marks what may be **authored now** (docs + migration SQL files) before the clone exists. **No migration apply. No production DDL.**

---

## 1. Scope

| In scope | Out of scope |
|----------|--------------|
| `secondary_unit_ids` cross-company attach / integrity | Soft RLS as destination / long dual soft mode |
| Occupancy refresh company-scoped correctness | Commercial / subscription (Sprint 8) |
| Unique constraint cutover (`national_id` / `national_id_or_cr` → composite per company) | Company memberships / multi-seat |
| `company_id NOT NULL` after zero-NULL proof | Assume-company product UX (Sprint 7; minimal hook only) |
| Parent-integrity triggers when RLS `WITH CHECK` is insufficient | Destructive cleanup of ALODILA rows |
| Audit SQL + migration drafts under `supabase/migrations/` | Executing any of the above against prod or clone without explicit approval |

---

## 2. Debt inventory

### 2.1 `secondary_unit_ids` cross-company

**Current shape**

- `public.contracts.secondary_unit_ids` is `jsonb not null default '[]'` (migration `003_contracts_secondary_units.sql`).
- App layer (`contracts.js`) normalizes IDs and calls `assertParentInWriteCompany('units', …)` for main + secondary units on create/update — **defense in depth at the SPA**, not DB structural enforcement.
- RLS on `contracts.company_id` does **not** validate that every UUID inside the JSON array belongs to the same company as the contract row. A forged client or service-role path could store cross-company unit IDs.

**Risk**

| Scenario | Failure mode |
|----------|--------------|
| Company B contract lists ALODILA unit UUID in `secondary_unit_ids` | Cross-tenant attach; occupancy / reports may touch wrong portfolio |
| Occupancy refresh counts secondary matches across poorly scoped queries | Wrong unit status flips |
| Soft-delete / terminate refreshes only some unit IDs | Stale occupancy on orphaned secondary units |

**Target fix (prefer shortest hard gate)**

1. **Keep** app `assertParentInWriteCompany` (already landed) — belt.
2. **Add** DB enforcement (suspenders) — see §5 triggers / constraints:
   - Prefer: trigger `BEFORE INSERT OR UPDATE OF unit_id, secondary_unit_ids, company_id, tenant_id` on `contracts` that expands `secondary_unit_ids`, joins `units`, and `RAISE` if any unit’s `company_id` ≠ contract `company_id` (or unit missing / soft-deleted when product forbids).
   - Optional later (post-beta): normalize to a junction table `contract_units(contract_id, unit_id, company_id, is_primary)` with FK + composite uniqueness — **not required** to close beta if the trigger + app checks pass QA.
3. Isolation QA cells: CB create/update contract with ALODILA unit id in secondary → **must fail** (app + DB).

**Author now (pre-clone):** audit query for existing nonempty `secondary_unit_ids` that resolve to units with mismatched `company_id` (expect 0 on ALODILA-only prod); draft trigger SQL as inert migration file `007_…` or fold into hard-RLS rewrite — **do not apply**.

---

### 2.2 Occupancy refresh

**Current shape**

- `refreshUnitOccupancyFromContracts(unitId)` in `src/lib/db/contracts.js`:
  - Loads unit with `withCompanyEq` + `assertRowInScope`.
  - Loads **all** active (`status=ساري`) contracts in read scope, then filters in JS for `unit_id` / `secondary_unit_ids` containing the unit.
  - Updates unit status with `withWriteCompanyEq`.

**Progress vs original debt**

- Stream C rewrite **started**: active-contract SELECT is company-scoped via `withCompanyEq` — no longer a global scan under a company session.
- Remaining risk under **SA silent ALODILA default** / mode `none` / assume gaps: scope resolution can still be wrong for privileged sessions until Sprint 5/7 cutover.

**Remaining work**

| Item | Priority | Notes |
|------|----------|-------|
| Prove CB occupancy never flips ALODILA unit status | **Blocker** | Matrix `ISO-HOT-02` |
| Avoid loading *all* company active contracts when refreshing one unit | Polish | Filter `.or(unit_id.eq.X, secondary contains X)` if PostgREST JSON ops allow; else keep JS filter **within** company scope |
| SA without assume must not run occupancy as “ALODILA portfolio” after hard gate | **Blocker** (persona) | Ties to Sprint 7 SA exit |
| Document status transition rules (`مؤجرة` ↔ `شاغرة`) unchanged | Docs | No product change |

**Author now:** extend isolation QA checklist rows for secondary-unit occupancy; optional SQL comment / RPC draft for server-side occupancy recompute scoped by `company_id` — apply only on clone after Auth bind.

**Do not merge into hard gate:** pure performance polish of the SELECT shape if company scoping already passes isolation matrix.

---

### 2.3 Unique constraints (`national_id` / identity)

**Current shape**

- `tenants`: global `UNIQUE (national_id_or_cr)` (`schema.sql`).
- `owners.national_id`: used for lookup / onboarding (`owner_lookup_for_onboarding`); treat as **effectively global identity** unless catalog proves otherwise — audit live indexes before drafting.

**Why this blocks Company B**

Two SaaS customers may legitimately onboard owners/tenants with the same Saudi NID/CR. A global unique constraint makes the second insert fail with `23505` and couples tenants across companies.

**Target cutover**

1. **Audit (read-only):** list duplicates of `(national_id…)` that would collide **across** companies (today: all ALODILA → expect 0 cross-company; still prove).
2. **Replace** global unique with **composite** (and soft-delete-aware if product needs reuse):
   - `UNIQUE (company_id, national_id_or_cr)` on `tenants` (partial: `WHERE is_deleted = false` if soft-delete reuse is required).
   - Same pattern for `owners.national_id` if a global unique exists or is implied by onboarding.
3. **App / onboarding:** `owner_lookup_for_onboarding` and smart-import match keys must become **company-scoped** (Sprint 5 owner onboarding alignment + this sprint’s schema).
4. Apply composite unique **only after** audit proves no blocking duplicates **and** `company_id` is stable (ideally after or with `NOT NULL`).

**Author now:** duplicate-detection SQL (comment-only in migration / docs appendix); draft `ALTER TABLE … DROP CONSTRAINT` + `CREATE UNIQUE INDEX … (company_id, …)` migration — **gated apply**.

---

### 2.4 `NOT NULL company_id` after zero-NULL proof

**Challenge ruling:** Reject nullable `company_id` past zero-NULL proof. Soft-NULL policy branches are speculative compatibility, not architecture.

**Gate sequence (clone, then prod)**

| Step | Action | Pass criteria |
|------|--------|---------------|
| N0 | Read-only `COUNT(*) FILTER (WHERE company_id IS NULL)` per PMS table | All = 0 |
| N1 | Spot-check non-ALODILA residual counts (expect 0 pre–Company B) | Documented |
| N2 | `ALTER TABLE … ALTER COLUMN company_id SET NOT NULL` per tenant table | Succeeds without rewrite of business columns |
| N3 | Drop soft-NULL branches from `company_matches` / app NULL-as-ALODILA | Strict equality only |
| N4 | FK already present from Packages 1–5 — keep | No destructive drop |

**Tables (expected set from Packages 1–5)**

`owners`, `tenants`, `properties`, `units`, `meters`, `contracts`, `invoices`, `payments`, `maintenance_requests` — confirm against live catalog before authoring the batch migration.

**Author now:** zero-NULL audit script (SELECT-only); single migration draft `00N_company_id_not_null.sql` with per-table `SET NOT NULL` + validation `DO $$ … RAISE` — **do not execute**.

**Rollback posture:** Prefer clone confidence over “nullable forever.” Re-allowing NULL is possible but should be emergency-only; do not design soft season as the happy path.

---

### 2.5 Parent integrity triggers (when RLS `WITH CHECK` is insufficient)

**Why RLS alone is not enough**

| Attach | RLS `WITH CHECK` on child `company_id` | Gap |
|--------|----------------------------------------|-----|
| `units.property_id` → `properties` | Child stamped correctly | Does not prove property row’s company equals child |
| `invoices.contract_id` → `contracts` | Same | Orphan / cross-FK if IDs guessed |
| `contracts.tenant_id` / `unit_id` | Same | Classic parent mismatch |
| `contracts.secondary_unit_ids[]` | **No FK** | JSON array invisible to FK/`WITH CHECK` column equality |
| `meters` → unit/property | Same as units | |

Sprint 4 design (§5.4) already flagged this; app `assertParentInWriteCompany` closes the SPA path. **Hard gate** needs DB triggers (or FK-enforced junction) for non-SPA / forged-client / service paths.

**Trigger policy (minimal set for beta)**

1. **contracts** — validate `tenant_id`, `unit_id`, and every `secondary_unit_ids` element share `company_id` with the contract (and parents exist, not deleted per product rules).
2. **units** — `property_id` company’s `company_id` = unit `company_id`.
3. **invoices / payments / maintenance_requests** — parent contract/unit/property company match (whichever FK is authoritative).
4. Prefer `SECURITY INVOKER` trigger functions in a non-exposed schema if project conventions allow; otherwise `public` with tight grants — follow Supabase skill: no careless `SECURITY DEFINER` in exposed schema.

**When to skip a trigger:** If a real FK already implies same-company denormalization *and* a CHECK/`WITH CHECK` equality is proven equivalent in isolation QA — document the skip. **Never skip** secondary_unit_ids.

**Author now:** trigger function drafts + test matrix expectations (pass/fail cases). Apply on clone after Auth bind + preferably after `NOT NULL`.

---

## 3. Merge with Sprint 7 (challenge recommendation)

| Debt item | Merge into beta gate? | Rationale |
|-----------|----------------------|-----------|
| Secondary-unit cross-company | **Yes** | Blocks two-tenant correctness |
| Composite NID uniques | **Yes** | Blocks Company B seed / import |
| `NOT NULL` after zero-NULL | **Yes** — prefer Hard isolation gate (4★∪5) | Ends soft-NULL theater |
| Parent integrity triggers (esp. secondary) | **Yes** if QA fails with RLS-only | Structural |
| Occupancy SELECT shape polish | **No** if scoped matrix passes | Cosmetic / perf |
| Full assume-company UI | Sprint 7 product; minimal SA assume for support | Challenge: defer UX, not SA silence |

Old sprint numbers may remain in git history; **execution order** follows the compressed gates in `SPRINT4_ARCHITECTURE_CHALLENGE.md`.

---

## 4. What can start NOW (before clone)

**Allowed today — documentation and SQL file authoring only. No apply. No MCP `execute_sql` / `apply_migration` for these changes.**

| Workstream | Artifact | Location (proposed) |
|------------|----------|---------------------|
| Zero-NULL audit queries | SELECT-only checklist | This doc §A · or `docs/sql/audit_company_id_nulls.sql` (comment header: READ ONLY) |
| Cross-company secondary_unit audit | SELECT expand jsonb → join units | Same |
| Duplicate NID audit | SELECT `company_id, national_id…, count` | Same |
| `NOT NULL` migration draft | Additive `ALTER … SET NOT NULL` | `supabase/migrations/00N_…_not_null.sql` (unapplied) |
| Composite unique migration draft | Drop global unique → create composite / partial unique | `supabase/migrations/00N_…_composite_identity.sql` |
| Parent / secondary trigger draft | `CREATE FUNCTION` + `CREATE TRIGGER` | `supabase/migrations/00N_…_parent_integrity.sql` |
| Occupancy / secondary QA cells | Checklist rows | Extend `SPRINT4_ISOLATION_QA.md` / test plan (docs only) |
| App notes | Call out remaining SA default + import match keys | Short notes in this doc; code changes when implementation sprint opens |

**Blocked until clone exists + approval**

- Applying any of the drafts.
- Seeding Company B.
- Flipping production Auth / RLS / `NOT NULL`.
- Calling isolation “complete” under SA bypass.

---

## 5. Proposed migration order (clone apply — future)

When an operator is assigned and clone is healthy (`SPRINT4_CLONE_STANDUP.md`):

```
1. Auth bind: ALODILA company login + claim normalization (Hard gate / Sprint 5)
2. Re-run zero-NULL + secondary + NID audits on clone
3. SET NOT NULL company_id
4. Strict RLS rewrite (no silent is_super_admin() PMS portfolio) — may replace soft 006 destination
5. Composite unique identity indexes
6. Parent integrity triggers (contracts secondary first)
7. Company B seed → isolation matrix including occupancy + secondary attach denials
8. Only then: prod promotion plan (same order; written approval)
```

If a step fails, **stop** — do not proceed to Company B or prod.

---

## 6. Exit criteria (Sprint 6 debt cleared)

Debt is **cleared** when all are true on **clone** (and recorded):

1. [ ] `company_id IS NULL` count = 0 on every PMS tenant table; columns are `NOT NULL`.
2. [ ] Soft-NULL / NULL-as-ALODILA policy and app branches removed or feature-flagged for emergency only with deletion date.
3. [ ] Global `UNIQUE (national_id_or_cr)` (and owners equivalent) replaced by **per-company** unique; CB can insert same NID as ALODILA without `23505`.
4. [ ] Cross-company `secondary_unit_ids` attach fails at **app and DB** (trigger or equivalent).
5. [ ] Parent FK attaches (unit→property, invoice→contract, contract→tenant/unit) cannot cross `company_id` under company login (RLS + triggers as needed).
6. [ ] Occupancy refresh under CB never alters ALODILA unit statuses (`ISO-HOT-02` PASS).
7. [ ] Isolation matrix company sessions show **zero cross-read / cross-write**; SA silent portfolio is **not** accepted as PASS (`SPRINT4_CLONE_STANDUP` H8).

Cosmetic occupancy query narrowing may remain open without blocking exit **if** (6)–(7) pass.

---

## 7. Risks & non-goals

| Risk | Mitigation |
|------|------------|
| Soft RLS `006` still OR-in `is_super_admin()` | Challenge: do not treat soft+SA as isolation complete; rewrite toward strict + assume |
| `NOT NULL` applied while residuals exist | Gate on audit = 0; never force with silent backfill in prod without approval |
| Composite unique breaks soft-deleted reuse | Prefer partial unique `WHERE is_deleted = false` after product decision |
| Trigger performance on bulk import | Keep functions set-based; index `(company_id, id)` already from Packages |
| Premature junction-table rewrite | Defer; JSONB + trigger is enough for beta |

**Non-goals:** billing, memberships, dropping `secondary_unit_ids` column, deleting ALODILA data, executing SQL from this plan.

---

## Appendix A — Audit query sketches (READ ONLY — do not run blindly against prod without operator approval)

```sql
-- Zero NULL company_id (repeat per table)
-- select 'contracts' as t, count(*) filter (where company_id is null) as nulls from public.contracts;

-- Secondary units whose unit.company_id <> contract.company_id
-- select c.id as contract_id, c.company_id, u.id as unit_id, u.company_id as unit_company
-- from public.contracts c
-- cross join lateral jsonb_array_elements_text(c.secondary_unit_ids) as sid(unit_id)
-- join public.units u on u.id = sid.unit_id::uuid
-- where c.company_id is distinct from u.company_id;

-- Tenant NID duplicates that would block composite unique within a company
-- select company_id, national_id_or_cr, count(*)
-- from public.tenants
-- where is_deleted = false
-- group by 1, 2 having count(*) > 1;
```

---

## Document control

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Companion | `SPRINT7_BETA_ASSUME_COMPANY_PLAN.md` |
| Execution | **Authoring only** until clone + written approval |

---

*End of Sprint 6 Isolation Debt Plan. No SQL executed.*
