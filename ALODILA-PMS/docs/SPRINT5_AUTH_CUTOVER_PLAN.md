# Sprint 5 — Auth Cutover Plan (Executable)

**Product:** ALODILA-PMS  
**Document type:** Auth persona cutover runbook (design + ordered steps)  
**Status:** READY FOR CLONE EXECUTION — **do not run SQL / create clone from this doc alone**  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Governing docs:** `SPRINT4_JWT_CLAIM_MODEL.md` · `SPRINT4_ARCHITECTURE_CHALLENGE.md` · `PLATFORM_ARCHITECTURE_V1.md` §5 · `SPRINT4_CLONE_STANDUP.md`

---

## 0. Verdict & merge with Sprint 4 clone gate

Architecture Challenge rejects a long Soft-RLS season before Auth. **Merge Auth bind into the late Sprint 4 Hard isolation gate on clone** where safe:

| Do on same clone campaign | Keep separate / later |
|---------------------------|------------------------|
| Provision ALODILA **company** login; smoke PMS as that user | Prod Auth rotates (after clone PASS) |
| Normalize claims → `app_metadata` only | Full assume-company product UI (Sprint 7) |
| App helpers: drop `user_metadata` authz fallback | Memberships / multi-seat |
| Dual-read SQL helpers → then `app_metadata`-only | Commercial / billing |
| Isolation matrix with **CA** (company), not SA | Soft RLS as long-lived prod mode |

**Order on clone (Hard isolation gate):**

```
S0  Clone restore (SPRINT4_CLONE_STANDUP) — approved separately
S1  Auth bind: ALODILA company login + claim audit/normalize   ← THIS DOC
S2  Smoke ALODILA ops AS company login (not SA)
S3  App cutover: roles.js + tenancy resolvers (fail-closed)
S4  SQL helpers dual-read → app_metadata-only (clone first)
S5  Zero-NULL → NOT NULL + strict RLS (Sprint 4 remaining)
S6  Company B + isolation matrix (CA/CB/OA/OB — never SA)
S7  Prod: same Auth → app → SQL order after written approval
```

This doc owns **S1–S4** and the Auth half of **S7**. It does **not** create the clone or apply SQL.

---

## 1. Target claim shapes (canonical)

Trusted path: **service role / Admin API only**. Never client `updateUser` / `signUp.options.data` for authz.

| Persona | `app_metadata` | Forbidden |
|---------|----------------|-----------|
| Platform SA | `{ "role": "platform_super_admin" }` | `company_id`, PMS auto-stamp |
| ALODILA / customer company | `{ "role": "company", "company_id": "<uuid>" }` | Authz in `user_metadata` |
| Owner portal | `{ "role": "owner", "owner_crm_id": "<owners.id>", "company_id": "<uuid>" }` | Role via client signup data |
| Staff (future) | `{ "role": "staff", "company_id": "<uuid>" }` | Treat ≡ company scope if issued |

**Cutover alias (dual-read window only):** `super_admin` ≡ `platform_super_admin`. **Write only** `platform_super_admin` on new/rotated users.

**ALODILA UUID:** `a1000000-a10d-4000-8000-000000000001`

---

## 2. Phase A — Provision ALODILA company login (clone first)

**Goal:** Day-to-day PMS ops use `role=company` + ALODILA UUID. Platform SA is **not** the PMS session.

### A.1 Inventory (clone Auth)

1. List Auth users; classify by current `role` path (`app_metadata` / `user_metadata` / top-level).
2. Flag: missing `company_id` on company/owner; authz keys in `user_metadata`; humans who today run PMS as `super_admin`.

### A.2 Create / bind ALODILA company login

| Step | Action |
|------|--------|
| 1 | Create **new** Auth user (or bind unused account) for ALODILA ops — **separate email** from Platform SA |
| 2 | Service-role set: `app_metadata = { role: "company", company_id: "a1000000-a10d-4000-8000-000000000001" }` |
| 3 | Strip `role` / `company_id` / `owner_crm_id` from that user’s `user_metadata` |
| 4 | Platform SA user(s): set `app_metadata.role = platform_super_admin`; **clear** `company_id`; strip authz from `user_metadata` |
| 5 | Force re-login (revoke refresh) so JWT reflects claims |

### A.3 Smoke (must pass before removing SA auto-stamp)

- [ ] Login as **company** user → staff console `/` (properties, contracts, invoices) works
- [ ] Login as **platform_super_admin** → `/platform/*` only; **no** silent unscoped PMS portfolio once Phase C flips transitional stamp
- [ ] Same human needing both → two accounts (MVP); do not merge personas in one JWT

### A.4 Merge note

Do **not** call isolation “done” until A.3 passes. Soft RLS / Company B proofs under SA alone are insufficient (Architecture Challenge §2).

---

## 3. Phase B — `app_metadata`-only authz (app + RLS helpers)

### B.1 Dual-read window (clone deploy)

| Layer | Dual-read order | End of Sprint 5 |
|-------|-----------------|-----------------|
| App `roles.js` | `app_metadata` **only** as soon as claim audit PASSes (prefer hard cut on app) | Same |
| App `companyIdFromUser` | Drop `user_metadata` immediately | Same |
| SQL helpers | `app_metadata` first → legacy top-level / `user_metadata` temporarily | Delete legacy branches |
| `is_super_admin()` | Thin alias → `is_platform_admin()` reading `app_metadata` (+ `super_admin` alias during window) | No top-level product `role` reads |

### B.2 App steps (ordered)

1. **`roles.js`:** `appRole` / `ownerCrmIdFromUser` read **`app_metadata` only**; map `super_admin` → platform persona; `isSuperAdminUser` true for `platform_super_admin` **or** legacy `super_admin`.
2. **`companyIdFromUser`:** `app_metadata.company_id` only; no `user_metadata` fallback.
3. **`resolveCurrentCompany`:** company/staff → claimed UUID; owner → require claim (row lookup only as brief bridge, then delete); platform without assume → `null` / `none`; **delete** `staff_legacy` → ALODILA default once company login exists.
4. **`resolveWriteCompany` / `resolveReadScope`:** remove SA→ALODILA transitional stamp/filter when Phase A smoke PASSes (platform without assume → deny write / `mode: none`).
5. **`App.jsx` + `PlatformGuard`:** routing per Architecture §5.5 — incomplete claims → blocked screen (no silent staff default).

### B.3 SQL helper steps (clone → prod; design targets)

Introduce / rewrite (names may stay for policy churn):

| Helper | Target |
|--------|--------|
| `jwt_app_role()` | `app_metadata.role` |
| `is_platform_admin()` | role ∈ `{platform_super_admin}` ∪ `{super_admin}` during window |
| `is_super_admin()` | deprecated alias → `is_platform_admin()`; **no** top-level claim as SoT |
| `is_company_login()` | `company` \| `staff` + `app_metadata.company_id` present |
| `is_owner_portal_user()` / `current_owner_id()` | `app_metadata` only at exit |
| `current_company_id()` | `app_metadata.company_id` only; **drop** SA→ALODILA default after ops split |

Apply on **clone** with Auth-bound CA before treating RLS isolation as PASS. Prod SQL only after clone matrix + approval.

---

## 4. Phase C — Owner portal claim cutover

### C.1 Provision existing owners

For each owner Auth user:

1. Set `app_metadata`: `{ role: "owner", owner_crm_id: "<owners.id>", company_id: "<owners.company_id>" }` (must match row).
2. Strip authz keys from `user_metadata`.
3. Revoke sessions; verify portal reads under RLS.

### C.2 Deprecate client-set authz

| Today (unsafe) | Target |
|----------------|--------|
| `signUp({ options: { data: { role, owner_crm_id } } })` → `user_metadata` | Signup creates Auth user **without** authz in `data`; **Edge Function / service-role** promotes claims into `app_metadata` after CRM lookup |
| App trusts `user_metadata.owner_crm_id` | `ownerCrmIdFromUser` → `app_metadata` only |
| Missing `company_id` → ALODILA default | Fail closed or one-shot row promote then require claim |

### C.3 Onboarding hardening rules

- Client may pass **non-authz** prefs only in `user_metadata` (display name, locale).
- After promote: strip `role` / `owner_crm_id` / `company_id` from `user_metadata` if present.
- Owner without both claims → blocked portal screen + re-provision path (not silent ALODILA).

---

## 5. Phase D — DevLogin / onboarding hardening

**File:** `src/pages/auth/DevLogin.jsx` (+ optional Edge Function).

| Change | Detail |
|--------|--------|
| Staff signup | Keep `DEV`-only; never set `role`/`company_id` from client |
| Owner signup | **Remove** `options.data.role` / `owner_crm_id`; call trusted provisioner (service role) post-signup |
| Post-login gate | If claims incomplete → sign out + error (do not navigate to `/owner` on `user_metadata` alone) |
| Platform / company | No self-serve claim elevation; Dashboard / platform bind only |
| Prod | Staff self-signup remains disabled (`import.meta.env.DEV`) |

**Optional but preferred:** `supabase/functions/provision-owner-claims` (or Admin script) — input: session user + national id lookup → writes `app_metadata` only.

---

## 6. Exit criteria

Sprint 5 Auth exit (and Auth half of Hard isolation gate) when **all** true:

| # | Criterion |
|---|-----------|
| E1 | ALODILA PMS smoke green on **company** login (`role=company`, ALODILA UUID) |
| E2 | Platform SA has `platform_super_admin`; **no** PMS auto-stamp/filter without assume |
| E3 | App authz reads **`app_metadata` only** (`roles.js`, `companyIdFromUser`, owner helpers) |
| E4 | No production authz dependency on `user_metadata` or top-level product `role` |
| E5 | Owner users carry `owner_crm_id` + `company_id` in `app_metadata`; portal works after re-login |
| E6 | DevLogin / onboarding cannot client-set authz roles |
| E7 | Incomplete claims → blocked UI (no `staff_legacy` / silent ALODILA) |
| E8 | Clone isolation matrix actors = CA/CB/OA/OB — **not** SA dual-visibility |
| E9 | Docs + helpers agree with `SPRINT4_JWT_CLAIM_MODEL.md` §1 / §8 |

---

## 7. Rollback

| Layer | Rollback | Notes |
|-------|----------|-------|
| Auth claims | Re-set previous `app_metadata`; temporarily restore dual-read app/SQL | Claims are reversible; force re-login after revert |
| App deploy | Revert PR; restore `user_metadata` fallback + SA→ALODILA stamp **only** behind explicit flag | Flag max one release; then delete |
| SQL helpers | Keep dual-read migration reversible; do not drop legacy branches until E3–E4 green on clone | Prefer additive `CREATE OR REPLACE` |
| Sessions | Revoke → users re-auth with rolled-back claims | Expected brief lockout |
| Do **not** | Use Soft RLS + SA bypass as long-term “rollback architecture” | That re-opens Architecture Challenge failure mode |

**Emergency break-glass:** temporary feature flag re-enabling SA→ALODILA stamp in `resolveWriteCompany` / `resolveReadScope` — time-boxed, logged, deleted after recovery.

---

## 8. Exact file touch list (implementation)

### 8.1 Must change (Auth cutover core)

| Path | Why |
|------|-----|
| `src/lib/auth/roles.js` | `app_metadata`-only; `platform_super_admin` + `super_admin` alias; drop `user_metadata` authz |
| `src/lib/auth/ownerScope.js` | Docs + assert path uses app-only helper |
| `src/lib/tenancy/resolveCurrentCompany.js` | `companyIdFromUser` app-only; remove `legacy_default_alodila` / `staff_legacy` after bind |
| `src/lib/tenancy/resolveWriteCompany.js` | Remove SA→ALODILA write stamp post Phase A |
| `src/lib/tenancy/resolveReadScope.js` | Remove SA→ALODILA read soft-filter post Phase A |
| `src/lib/tenancy/types.js` | Retire / mark obsolete `legacy_default_alodila` source when deleted |
| `src/lib/tenancy/index.js` | Re-exports if helper signatures change |
| `src/pages/auth/DevLogin.jsx` | No client-set role/`owner_crm_id`; gate incomplete claims |
| `src/App.jsx` | Persona routing §5.5; incomplete-claim block screen |
| `src/platform/components/PlatformGuard.jsx` | Recognize `platform_super_admin` (+ alias) |

### 8.2 Likely touch (routing / copy / consumers)

| Path | Why |
|------|-----|
| `src/components/OwnerLayout.jsx` | Owner gate uses updated role helpers |
| `src/lib/ai/chatContext.js` | Error copy / role detection → app_metadata |
| `src/lib/db/owners.js` | `ownerLookupForOnboarding` may feed provisioner (not client claims) |
| `src/i18n/locales/ar.json` / `en.json` (+ phase2 if needed) | Blocked-claim / re-provision messages |
| `src/platform/components/panels/LoginBindingPanel.jsx` | If UI binds company login claims |

### 8.3 SQL / schema (clone first — **do not apply from this doc**)

| Path | Why |
|------|-----|
| New migration under `supabase/migrations/` (e.g. `007_sprint5_jwt_app_metadata.sql`) | `jwt_app_role`, `is_platform_admin`, tighten `current_company_id` / owner helpers |
| `schema_owner_portal_rls.sql` | Align helper bodies with app_metadata-only (or supersede via numbered migration) |
| `schema_phase13_owner_financial_rls.sql` | Only if it still dual-reads `user_metadata` |
| `supabase/migrations/006_sprint4_soft_rls_*.sql` | Coordinate: prefer Auth-bound CA before / with strict rewrite per Architecture Challenge |

### 8.4 Optional new

| Path | Why |
|------|-----|
| `supabase/functions/provision-owner-claims/` (or `scripts/provision-auth-claims.mjs`) | Service-role claim writer; strips user_metadata authz |
| `docs/SPRINT5_AUTH_CUTOVER_CHECKLIST.md` | Operator tick-sheet derived from this plan (if needed) |

### 8.5 Do not touch for Auth cutover

- PMS module `lib/db/*` query inventories (already stamped/filtered) — unless a call site bypasses resolvers
- Platform company CRUD schema
- Billing / memberships
- Assume-company product UI (`assumeCompanyContext.js` hook may stay minimal)

---

## 9. Execution checklist (operator)

```
[ ] Clone approved + .env.clone pointed at clone (not prod)
[ ] Claim audit spreadsheet filled
[ ] ALODILA company login provisioned (separate from SA)
[ ] Platform SA normalized to platform_super_admin
[ ] Owner users promoted to app_metadata (+ company_id)
[ ] user_metadata authz keys stripped
[ ] Sessions revoked; re-login verified
[ ] App PR: roles + resolvers + DevLogin + routing
[ ] ALODILA smoke as company login PASS
[ ] Platform without assume: PMS write denied / read none
[ ] SQL helpers dual-read on clone; then app_metadata-only
[ ] Isolation matrix with CA (not SA)
[ ] Written approval → prod Auth → app → SQL same order
[ ] Rollback flag deleted within one release
```

---

## 10. Non-goals (this sprint)

- `company_members` / invites / seat roles  
- Company switcher / multi-company JWT arrays  
- Persisted assume-company product (Sprint 7)  
- Hard `company_id NOT NULL` (owned by Hard isolation gate SQL track; Auth bind is a **prerequisite**, not the DDL itself)  
- Executing SQL or creating the clone from this document  

**Next consumers:** clone operators (`SPRINT4_CLONE_STANDUP.md`) · app implementers (file list §8) · SQL migration author (helper targets §3.B.3).

---

*End of Sprint 5 Auth Cutover Plan. No SQL executed. No clone created.*
