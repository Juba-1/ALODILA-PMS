# Sprint 7 — Multi-Company Beta & Audited Assume-Company Plan

**Product:** ALODILA-PMS  
**Document type:** Execution plan (docs + SQL/app **authoring** only — **no SQL execution**)  
**Author role:** Roadmap Planning Agent  
**Date:** 2026-08-04  
**Status:** READY FOR AUTHORING (clone + Hard isolation gate gated)  
**Governing sources:** `PLATFORM_ARCHITECTURE_V1.md` · `SPRINT4_ARCHITECTURE_CHALLENGE.md` · `SPRINT4_JWT_CLAIM_MODEL.md` · `SPRINT4_SHARED_ADAPTER.md` · `SPRINT4_CLONE_STANDUP.md` · `SPRINT6_ISOLATION_DEBT_PLAN.md` · stub `src/lib/tenancy/assumeCompanyContext.js`

**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`

---

## 0. Verdict (architecture challenge alignment)

Prefer the **shorter hard gate**, then beta — not a months-long soft corridor:

```
▶ Hard isolation gate (merged 4-remaining ∪ 5):
    ALODILA company Auth bind · zero-NULL · NOT NULL · strict RLS
    · structural blockers from Sprint 6 that fail two-tenant correctness
▶ This sprint (beta):
    Company B provision + one login · isolation matrix PASS
    · audited assume-company (replace stub) · SA no longer silent PMS bypass
```

**Challenge rulings this sprint must obey**

| Ruling | Implication |
|--------|-------------|
| Soft RLS + silent SA portfolio is **not** isolation-safe | Beta PASS judged by **CA/CB/OA/OB**, never by SA dual visibility (`CLONE_STANDUP` H8) |
| Defer full assume-company **product chrome** if needed | Still ship a **minimal audited assume** so SA can support without unscoped SELECT |
| Fold Sprint 6 **blockers** into beta readiness | Composite NID, secondary-unit integrity, `NOT NULL` — see Sprint 6 plan |
| Do not expand `companyDb` façade | Thin helpers + assume hook only |

**This document authorizes planning and file authoring only. No SQL apply. No Auth claim writes to production. No Company B seed until clone exists and Hard gate steps pass.**

---

## 1. Goals & non-goals

### Goals

1. Provision **second company (Company B)** on **clone** with exactly **one** company login (MVP: One Company = One Login).
2. Replace `assumeCompanyContext.js` stub with an **audited** assume-company path so Platform Super Admin can operate a single company explicitly.
3. End **silent** Super Admin → ALODILA PMS default (`legacy_default_alodila` write stamp / portfolio read).
4. Meet **beta exit criteria** (§7) with recorded isolation matrix results.

### Non-goals

- Production Company B / public multi-tenant marketing launch.
- Company memberships, invites, multi-seat staff, company switcher for company logins.
- Billing enforcement / Stripe (Sprint 8).
- Long soft-NULL policy season.
- Executing migrations or Auth admin API against production from this plan.

---

## 2. Prerequisites (Hard isolation gate — must be true before beta seed)

Treat these as **entry criteria**. If missing, this sprint stays in authoring mode.

| # | Prerequisite | Source |
|---|--------------|--------|
| P1 | Clone project exists, healthy, separate `.env.clone` | `SPRINT4_CLONE_STANDUP.md` |
| P2 | Packages 1–5 state verified on clone; do not re-apply `005_*` | Same |
| P3 | ALODILA **company** login bound (`app_metadata.role=company`, `company_id=ALODILA`); smoke as company login, **not** SA | Challenge S1–S2 · JWT model |
| P4 | Zero-NULL proof → `company_id NOT NULL` authored/applied on clone | Sprint 6 §2.4 |
| P5 | Strict company RLS on clone: company match / owner graph; **no** silent `is_super_admin()` full PMS portfolio | Challenge S4 · JWT §4.2 |
| P6 | Sprint 6 blockers that fail two-tenant correctness either **applied on clone** or scheduled as same campaign waves before CB seed (secondary integrity, composite NID) | `SPRINT6_ISOLATION_DEBT_PLAN.md` |
| P7 | Isolation QA templates ready (`SPRINT4_ISOLATION_QA.md` / test plan) | Docs |

**Stop condition:** Any tool targeting production `ryfqqyrqmsyngwcsfjug` as a **write** destination during beta work → abort.

---

## 3. Second company beta (Company B)

### 3.1 Provisioning (clone only)

| Step | Action | Notes |
|------|--------|-------|
| B1 | Insert `companies` row via Platform Admin (SA) or approved seed SQL | Status `active` or `provisioning`→`active`; unique `slug` |
| B2 | Create Auth user for Company B | Service role / Dashboard only |
| B3 | Set `app_metadata`: `role=company`, `company_id=<Company B UUID>` | **Never** `user_metadata` for authz |
| B4 | Bind `companies.auth_user_id` (or equivalent) | One Company = One Login |
| B5 | Optional: seed minimal CB portfolio (1 property, 1 unit, 1 tenant, 1 contract) | Enough for matrix; do not copy ALODILA rows |
| B6 | Record UUIDs offline (company id, auth user id) | Secrets store — not in git |

### 3.2 Personas for matrix

| Code | Persona | Expectation |
|------|---------|-------------|
| **CA** | ALODILA company login | Full ALODILA ops; zero CB rows |
| **CB** | Company B login | Full CB ops; zero ALODILA rows |
| **OA / OB** | Owner portal A / B | Read-only; company-aligned owner graph |
| **SA** | `platform_super_admin` | Platform `/platform` only **until** assume; PMS denied without assume |
| **SA→CB** | SA with audited assume = B | PMS scoped **only** to B; audit row written |

### 3.3 What “beta” means

- Staging/clone proof that two tenants coexist under shared schema.
- Optional **pilot** (single friendly operator on clone or approved preview) — product call, not required for engineering exit.
- **Not** production cutover of a paying second customer until exit + written approval + prod Hard gate replay.

---

## 4. Audited assume-company (replace stub)

### 4.1 Current stub

`src/lib/tenancy/assumeCompanyContext.js` today:

- `getAssumeCompanyId()` → always `null`
- `hasAssumeCompanyContext()` → always false  
Documented as “Sprint 7 placeholder.” Resolvers already *conceptually* allow assume as a source; write path still special-cases SA → ALODILA (`resolveWriteCompany` `legacy_default_alodila`).

### 4.2 Target behavior (minimal product — challenge-aligned)

**Enough for support / isolation proof; not a polished admin suite.**

| Concern | Target |
|---------|--------|
| Who | Only `platform_super_admin` (dual-read legacy `super_admin` during cutover) |
| What | Explicit `company_id` context for PMS reads/writes |
| Duration | Time-boxed (session TTL and/or absolute expiry) |
| Audit | Append-only record: actor user id, target company_id, started_at, ended_at, reason, client meta |
| Without assume | SA **cannot** list/mutate PMS domain via adapter; `/platform` `companies` still allowed |
| Storage (pick one, document choice before code) | **A)** `sessionStorage` + server audit insert via RPC · **B)** platform table `company_assume_sessions` as source of truth + JWT/session flag refresh · Prefer **auditable DB row**; avoid trust-only client storage |

**Recommended MVP shape**

1. Table `public.company_assume_sessions` (or `platform_assume_company_sessions`):  
   `id`, `actor_user_id`, `company_id`, `reason`, `started_at`, `expires_at`, `ended_at`, `created_at`.  
   RLS: SA SELECT/INSERT/UPDATE own active rows only (or service-role RPC).
2. RPC `start_assume_company(p_company_id, p_reason, p_ttl_minutes)` / `end_assume_company()` — validates SA, company exists & not soft-deleted, writes audit row, returns session id + company_id.
3. App: replace stub — `getAssumeCompanyId()` reads active non-expired session (from memory cache hydrated after RPC, or claim refresh if using custom access token hook — **prefer not** to put assume in editable `user_metadata`).
4. `resolveCurrentCompany` / `resolveReadScope` / `resolveWriteCompany`:  
   - SA + active assume → that `company_id`, `allowWrite: true`, source `assume_company`  
   - SA + no assume → `companyId: null`, `allowWrite: false` for PMS (**delete** `legacy_default_alodila` for platform persona)
5. Platform UI: minimal panel — company picker, reason text, Start / End, show expiry. No portfolio browser of all tenants’ rows without assume.

### 4.3 Explicitly out of assume MVP

- Impersonating owner portal users.
- Assuming multiple companies at once.
- Permanent “ALODILA ops as SA” without assume.
- Client-only assume with no audit row.

---

## 5. SA no longer silent PMS bypass

### 5.1 Today’s debt

| Layer | Behavior |
|-------|----------|
| App `resolveWriteCompany` | SA + `source: none` → stamp **ALODILA**, `allowWrite: true` |
| Soft RLS `006` design | `is_super_admin()` OR company match → SA sees/writes all |
| Ops reality | Daily ALODILA work often uses SA session |

This fails the challenge test: isolation QA under SA bypass does **not** prove SaaS risk.

### 5.2 Target end state

| Surface | SA without assume | SA with assume | ALODILA company login |
|---------|-------------------|----------------|------------------------|
| `/platform` companies | Allowed | Allowed | Denied |
| PMS lists / creates / occupancy | **Denied** | Scoped to assumed company | Scoped to ALODILA |
| RLS SELECT/WRITE PMS | Deny (no SA OR) | Match assumed company **or** policy uses assume helper | `company_matches` |
| Audit | — | Required | N/A |

### 5.3 Cutover sequence (clone first)

1. Bind and smoke **CA** (ALODILA company login) for all day-to-day ops paths.
2. Implement assume stub→real; Platform UI minimal Start/End.
3. Flip app: remove SA `legacy_default_alodila` write/read defaults.
4. Apply / rewrite RLS: remove silent SA PMS portfolio; keep SA on `companies`; optional `assume_active_company_id()` helper for PMS policies.
5. Verify matrix: SA alone cannot SELECT CB or ALODILA business rows; SA→CB sees only CB.
6. Only after clone PASS: plan prod Auth + RLS + app deploy order (feature flag if needed for emergency rollback **one release**, then delete).

### 5.4 Rollback (emergency)

- Temporary feature flag restoring SA→ALODILA stamp **only** if CA login is broken — time-boxed, logged, deleted after fix.
- Do **not** reintroduce soft-NULL theater as rollback.

---

## 6. What can start NOW (before clone)

**Docs + SQL/app authoring only. No execution against any database.**

| Workstream | Artifact |
|------------|----------|
| This plan + Sprint 6 debt plan | Done / living docs |
| Assume session table + RPC **draft** migration | `supabase/migrations/00N_assume_company_sessions.sql` (unapplied) |
| Strict RLS rewrite notes / draft replacing silent SA OR on PMS | Candidate next to or instead of soft `006` destination — unapplied |
| App design notes: stub API surface (`getAssumeCompanyId`, start/end) | May sketch types in comments; implementation when gate opens |
| Company B seed script (idempotent INSERT sketches) | Docs / `.sql` with header **CLONE ONLY** |
| Extend isolation matrix for SA deny + SA→assume cells | `SPRINT4_ISOLATION_QA.md` rows (docs) |
| Operator runbook: CA bind checklist (Auth Dashboard steps) | Short appendix or clone stand-up cross-link |

**Do not start now**

- Creating Company B in production.
- Disabling SA PMS access in production before CA bind smoke.
- Applying `NOT NULL` / triggers / assume DDL without clone PASS path.

---

## 7. Exit criteria (beta met)

Engineering **beta exit** requires all boxes on **clone** (recorded evidence: checklist + timestamps + operator):

### Isolation & tenancy

- [ ] Company B provisioned; **CB** login works; One Company = One Login binding stored.
- [ ] CA sees **zero** CB rows; CB sees **zero** ALODILA rows (SELECT matrix PASS).
- [ ] CA/CB cannot write across tenants (INSERT/UPDATE/soft-delete matrix PASS).
- [ ] Owner OA/OB alignment PASS (no cross-company owner graph).
- [ ] Sprint 6 blockers required for two tenants PASS (composite NID, secondary_unit deny, occupancy `ISO-HOT-02`, `NOT NULL` in effect).

### Super Admin & assume

- [ ] SA **without** assume: PMS adapter denies reads/writes; `/platform` still works.
- [ ] `legacy_default_alodila` **removed** for platform persona (or flag off with deletion date).
- [ ] SA **with** assume: scoped to one company; Start/End works; **audit row** exists for each assume.
- [ ] Expired / ended assume restores deny.
- [ ] Soft RLS silent SA portfolio **not** accepted as PASS evidence.

### Process

- [ ] No production writes performed during beta engineering.
- [ ] Prod promotion plan drafted (same order as clone) — **not** auto-executed.
- [ ] Optional pilot decision recorded (yes/no); if yes, scope and data-handling rules written.

**Commercial / subscription stub remains Sprint 8** — not required for this exit.

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Ops locked out if CA bind incomplete when SA bypass removed | Gate flip on CA smoke; emergency flag (§5.4) |
| Assume stored only in `sessionStorage` → unaudited | Require DB audit row; client is cache only |
| JWT claim staleness after assume | Prefer DB session check in RPC/helpers; refresh app cache on start/end |
| Soft `006` still applied as-is on clone | Rewrite toward strict + assume before calling beta PASS |
| NID global unique blocks CB seed | Sprint 6 composite unique before or with CB tenant/owner inserts |
| Doc / sprint number drift | Execute compressed gates; keep these docs as living checklists |

---

## 9. Relationship to compressed roadmap

From `SPRINT4_ARCHITECTURE_CHALLENGE.md`:

```
✅ 1–3  Foundation (done)
▶ 4★   Hard isolation gate = Auth bind (ALODILA) + NOT NULL + strict RLS + clone QA prep
▶ 5★   Multi-company beta = Company B + structural debt that fails QA + audited assume
▶ 6    Subscription stub / hardening / docs (old 8–9)
```

This file is the **5★ beta** plan under old numbering (**Sprint 7**). Sprint 6 isolation debt blockers are **inputs**, not a separate philosophy phase.

---

## Document control

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Companion | `SPRINT6_ISOLATION_DEBT_PLAN.md` |
| Stub to replace | `src/lib/tenancy/assumeCompanyContext.js` |
| Execution | **Authoring only** until clone + Hard gate + written approval |

---

*End of Sprint 7 Beta & Assume-Company Plan. No SQL executed.*
