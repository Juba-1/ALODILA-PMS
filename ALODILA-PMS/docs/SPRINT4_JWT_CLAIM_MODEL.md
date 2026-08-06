# Sprint 4 — JWT Claim Model (Definitive)

**Product:** ALODILA-PMS  
**Document type:** Authz claim design only (no SQL, no prod changes)  
**Status:** APPROVED TARGET for Sprint 5 cutover  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Governing docs:** `PLATFORM_ARCHITECTURE_V1.md` §5 · `SPRINT4_RLS_DESIGN.md` §2–3 · app `resolveCurrentCompany` / `roles.js`

---

## 0. Verdict

**One canonical authz path:** `auth.jwt` → `app_metadata` only.

| Claim | Authz? | Who sets it |
|-------|--------|-------------|
| `app_metadata.role` | **Yes** | Service role / platform provisioning only |
| `app_metadata.company_id` | **Yes** | Same |
| `app_metadata.owner_crm_id` | **Yes** | Same (owner portal) |
| `user_metadata.*` | **Never** | End-user editable → forbidden for RLS / routing / stamps |
| Top-level JWT `role` / `company_id` / `owner_crm_id` | **Legacy only** | Deprecate in Sprint 5; remove authz use by Sprint 5 exit |

**Keeping top-level `is_super_admin()` forever is a mistake.** Recommend retiring it as the *source of truth* (see §8).

---

## 1. Trusted claims (`app_metadata` only)

Set exclusively by service role / Dashboard Admin API / controlled provisioning. Never by client `updateUser`.

### 1.1 Canonical shapes

| Persona | `app_metadata.role` | Required claims | Optional / notes |
|---------|---------------------|-----------------|------------------|
| **Platform Admin** | `platform_super_admin` | — | No `company_id`. PMS data only after audited assume-company (Sprint 7). |
| **Company Admin** | `company` | `company_id` (UUID) | MVP “one company = one login”. Full ops console. |
| **Staff** | `staff` | `company_id` (UUID) | Reserved for future multi-seat; same company scope as `company`. Sprint 5 may treat `staff` ≡ company operator for RLS. |
| **Owner** | `owner` | `owner_crm_id`, `company_id` | Read-only portal. `company_id` must match `owners.company_id`. |
| **Multi-company user (future)** | *(not issued)* | — | See §7 — no membership array in JWT for MVP. |

### 1.2 Role string rules

- Values are lowercase snake_case; compare with `lower(trim(...))`.
- **Alias during cutover only:** `super_admin` ≡ `platform_super_admin` (read both; **write only** `platform_super_admin` on new/rotated users).
- Do **not** invent parallel names (`admin`, `superadmin`, email-based gates).

### 1.3 Forbidden in `app_metadata` (MVP)

- `company_ids[]`, `memberships`, `permissions[]`, `is_admin` booleans, hard-coded emails as authz.

---

## 2. `user_metadata` — forbidden for authorization

Supabase `user_metadata` / `raw_user_meta_data` is **user-editable** and appears in the JWT. Using it for RLS or routing is an elevation path.

| Allowed | Forbidden |
|---------|-----------|
| Display name, locale, onboarding flags, UI prefs | `role`, `company_id`, `owner_crm_id`, any authz flag |

**App cutover:** `roles.js` / `companyIdFromUser` must stop falling back to `user_metadata` for authz (Sprint 5). Owner sign-up that today writes role into `user_metadata` must **immediately** promote claims via service role into `app_metadata`, then strip authz keys from `user_metadata`.

**RLS cutover:** helpers that still coalesce `user_metadata` keep it only as a **read-compat** branch until claim audit passes; then delete the branch.

---

## 3. Top-level JWT claims — legacy path & deprecation

### 3.1 Today (transitional)

| Helper / consumer | Current read path |
|-------------------|-------------------|
| `is_super_admin()` | **Top-level** `claims ->> 'role' = 'super_admin'` |
| `is_owner_portal_user()` / `current_owner_id()` | `app_metadata` → `user_metadata` (owner id also top-level fallback) |
| `current_company_id()` | `app_metadata.company_id` → top-level → `user_metadata` → owner/SA ALODILA default |
| `is_company_login()` | `app_metadata` → `user_metadata` → top-level (`company` / `staff` / …) |
| App `appRole` / `resolveCurrentCompany` | `app_metadata` then `user_metadata`; persona `super_admin` → `platform_super_admin` |

Top-level `role` also collides conceptually with Supabase’s session role (`authenticated` / `anon`). Relying on it for product authz is fragile and diverges from owner/company helpers.

### 3.2 Deprecation policy

1. **Sprint 4 (now):** Document only; do not break live `super_admin` ops.
2. **Sprint 5:** Dual-read window — helpers accept `app_metadata` **first**, then legacy top-level / `user_metadata`.
3. **Sprint 5 exit:** Authz reads **`app_metadata` only**. Top-level product claims ignored. Fail closed on incomplete claims (except explicit break-glass).

---

## 4. Transitional Super Admin → Platform Admin

### 4.1 Today’s production reality

- Live ALODILA operators use **`role = super_admin`** (top-level path in RLS).
- App treats them as persona `platform_super_admin`.
- Without assume-company: `resolveCurrentCompany` → `companyId: null`, `source: 'none'`.
- Soft transition stamps/filters as **ALODILA** (`resolveWriteCompany` / `resolveReadScope`) so PMS creates/lists keep working.
- DB `current_company_id()` also defaults unresolved `is_super_admin()` → ALODILA.

This is **intentional soft-RLS debt**, not the end state.

### 4.2 Target end state

| Concern | Target |
|---------|--------|
| Claim | `app_metadata.role = platform_super_admin` |
| Control plane (`companies`, platform routes) | Allowed |
| Unscoped PMS portfolio | **Denied** |
| ALODILA day-to-day ops | Separate **Company Admin** login (`role=company`, `company_id=ALODILA`), **or** explicit audited assume-company (Sprint 7) |
| Write stamp without company context | **Denied** (remove ALODILA auto-stamp for platform persona) |

### 4.3 Migration sequence (operators)

1. Inventory Auth users with `super_admin` (any path).
2. For each human who runs ALODILA PMS daily: provision/bind **company** login with `company_id = ALODILA`; verify ops smoke.
3. For platform-only humans: set `app_metadata.role = platform_super_admin`; clear `company_id`; clear authz from `user_metadata`.
4. Dual-read: `is_platform_admin()` true for `platform_super_admin` **or** legacy `super_admin`.
5. Flip app transitional stamp/filter off for platform persona without assume-company.
6. Stop issuing `super_admin`; revoke sessions; confirm refresh picks up new claims.
7. Narrow SQL helper to `app_metadata` only; drop top-level equality as authz source.

---

## 5. Alignment: `current_company_id()` ↔ `resolveCurrentCompany`

Both must converge on the **same** claim semantics. Differences today are transitional and must close in Sprint 5.

| Session | App `resolveCurrentCompany` (target) | DB `current_company_id()` (target) |
|---------|--------------------------------------|-------------------------------------|
| `company` / `staff` + `company_id` | That UUID · `jwt_company_id` | Same UUID from `app_metadata.company_id` |
| `owner` + both claims | Claimed UUID · `jwt_owner_company_id` | Same; optional soft check vs `owners.company_id` outside this helper |
| `owner` missing `company_id` | Temporary: row lookup / ALODILA default | Prefer claim present after cutover; no silent cross-tenant invent |
| `platform_super_admin` no assume | `null` · `source: none` | `null` (no ALODILA default) |
| `platform_super_admin` + assume | Assumed UUID · `assume_company` | Assume claim / GUC when Sprint 7 lands; until then app-only |
| Incomplete / unknown | Fail closed (post-cutover) | `null` → deny company predicates |

**Rules**

- Prefer `app_metadata.company_id` only after cutover.
- Never trust client PostgREST filters as company authority.
- JWT reads: `current_setting('request.jwt.claims', true)` (project rule — not `auth.jwt()` alone).
- Claims are stale until refresh — after claim edits, force re-login or refresh.

---

## 6. Sprint 5 cutover steps

Ordered, actionable. Design-only here — execute in Sprint 5.

1. **Claim audit (clone first)** — List users; classify persona; flag `user_metadata` authz keys and missing `company_id` on owners/company logins.
2. **Provisioning scripts** — Service-role updater: set `app_metadata` shapes in §1; strip authz from `user_metadata`.
3. **ALODILA ops split** — Ensure day-to-day ops use `role=company` + ALODILA UUID before removing SA auto-stamp.
4. **App helpers** — `appRole` / `isSuperAdminUser` / `companyIdFromUser` / owner helpers: `app_metadata` only; map `super_admin` → platform persona alias; remove `user_metadata` authz fallback.
5. **Routing** — Match Architecture §5.5; incomplete claims → blocked screen (no silent staff default).
6. **SQL helpers (clone → prod)** — Introduce/replace:
   - `jwt_app_role()` → `app_metadata.role`
   - `is_platform_admin()` → role in (`platform_super_admin`, legacy `super_admin` during window)
   - `is_super_admin()` → thin wrapper calling `is_platform_admin()` **or** rewrite body to `app_metadata` (keep name temporarily for policy churn)
   - `current_company_id()` → drop top-level / `user_metadata` / SA→ALODILA default once ops split verified
7. **Remove transitional app paths** — Delete SA→ALODILA stamp/filter in `resolveWriteCompany` / `resolveReadScope` when platform has no company context.
8. **Session revoke** — Sign out affected users; verify new JWTs.
9. **Isolation proof** — Company A cannot read/write Company B; platform without assume cannot stamp PMS rows; owner cannot write.
10. **Exit criteria** — No authz dependency on top-level product `role` or `user_metadata`; docs + helpers agree; ALODILA ops green on company login.

---

## 7. Explicit non-goals (MVP / Sprint 5)

| Non-goal | Why |
|----------|-----|
| `company_members` / invites / seat roles | Post-MVP (Architecture §5.7) |
| Company switcher UI | One session → one company |
| Multi-company JWT (`company_ids[]`) | No array claims; future = memberships table + short-lived assume, not fat JWT |
| Persisted assume-company in JWT | Sprint 7 audited break-glass |
| Hard RLS / `company_id NOT NULL` | Sprint 6+ |
| Billing seats as tenancy source | Subscription follows company, not JWT |

**Future multi-company users:** do **not** encode multiple companies in claims now. When needed: membership rows + explicit context selection that sets a **single** active `company_id` (server-side), still one company per request.

---

## 8. Challenge: forever top-level `is_super_admin()`?

### 8.1 Why keeping it forever is wrong

1. **Wrong layer** — Product role belongs in `app_metadata`, not beside Postgres `role=authenticated`.
2. **Split brain** — Owner/company already prefer nested metadata; SA-only top-level guarantees drift.
3. **Blocks rename** — Cannot move to `platform_super_admin` cleanly while policies hard-code top-level `super_admin`.
4. **Hides ops debt** — Top-level SA + ALODILA default lets platform persona keep writing PMS without a company login.

### 8.2 Recommendation — one canonical role path

```
authz role     = claims.app_metadata.role
authz company  = claims.app_metadata.company_id
authz owner    = claims.app_metadata.owner_crm_id

is_platform_admin()  ⇔  role ∈ { platform_super_admin } ∪ { super_admin during Sprint 5 only }
is_company_operator() ⇔  role ∈ { company, staff } AND company_id present
is_owner_portal_user() ⇔  role = owner AND owner_crm_id present
```

- **Keep the function name** `is_super_admin()` only as a deprecated alias → `is_platform_admin()` until all policies are rewritten; do **not** keep top-level claim reads.
- **Canonical issued role** for new platform users: `platform_super_admin`.
- **Canonical issued role** for ALODILA PMS ops: `company` + ALODILA `company_id`.

---

## 9. Quick reference — target JWT `app_metadata`

```json
// Platform Admin
{ "role": "platform_super_admin" }

// Company Admin (ALODILA or customer)
{ "role": "company", "company_id": "a1000000-a10d-4000-8000-000000000001" }

// Staff (future multi-seat; same scope)
{ "role": "staff", "company_id": "<company-uuid>" }

// Owner portal
{
  "role": "owner",
  "owner_crm_id": "<owners.id uuid>",
  "company_id": "<company-uuid>"
}
```

---

## 10. Out of scope for this document

- Executing Auth user updates or SQL on clone/prod  
- Implementing assume-company persistence  
- Membership schema  

**Next consumer:** Sprint 5 Auth persona cutover checklist (implement against this model).
