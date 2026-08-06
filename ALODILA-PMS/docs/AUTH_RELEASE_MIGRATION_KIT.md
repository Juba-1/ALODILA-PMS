# Auth Release Migration Kit — Gate A / Clone Cutover

**Product:** ALODILA-PMS  
**Document type:** Executable operator kit (inventory → promote → verify)  
**Status:** READY FOR **LOCAL / CLONE ONLY** — Production is **NO-GO** until written approval  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Governing docs:** [SPRINT5_AUTH_CUTOVER_PLAN.md](./SPRINT5_AUTH_CUTOVER_PLAN.md) · [SPRINT4_JWT_CLAIM_MODEL.md](./SPRINT4_JWT_CLAIM_MODEL.md)

---

## 0. Verdict (reuse — do not re-audit)

| Fact | Implication |
|------|-------------|
| Soft RLS **006 V2** reads **`app_metadata` only** for company/owner | `user_metadata` authz is ignored by RLS — but still an elevation risk if app ever dual-reads |
| App `roles.js` is **`app_metadata`-only** | Users with authz only in `user_metadata` appear unprivileged in the app |
| Owner signup still writes **`user_metadata`** | Must promote via **service role** before portal works post-cutover |
| Local validation **22/22 PASS** | Harness is green; Auth bind is the remaining Gate A blocker |
| Production **UNTOUCHED** | **NO-GO** for prod Soft RLS until Auth bind + clone matrix PASS |

**SQL `is_company_login()`** (006 V2): `app_metadata.role` ∈ `{ company, company_admin, company_staff }` **and** `company_id` present. Bare `staff` is **not** accepted.

---

## ⛔ STOP — Production guardrail

**Never run inventory promote steps against Production** (`ryfqqyrqmsyngwcsfjug` or any `*.supabase.co` host) **without written approval** from Auth Release Owner + Platform Lead.

| Allowed now | Forbidden now |
|-------------|---------------|
| Local Supabase (`127.0.0.1` / `localhost`) | Production Supabase project |
| Approved **clone** host with `ALLOW_NON_LOCAL_AUTH_PROMOTE=YES` | `auth-promote.local.mjs --apply` on prod URL |
| Read-only `auth-inventory.sql` on clone | Client `updateUser` / signup `options.data` for authz |

The promote script **hard-refuses** `ryfqqyrqmsyngwcsfjug` even when `ALLOW_NON_LOCAL_AUTH_PROMOTE=YES`.

---

## 1. Kit artifacts (this release)

| Path | Purpose |
|------|---------|
| `rls-validation/release/auth-inventory.sql` | Read-only Auth user classification (clone/local) |
| `rls-validation/release/auth-promote.local.mjs` | Service-role claim promoter (dry-run default) |
| `rls-validation/release/.env.auth.example` | Env template — **never** production secrets |

---

## 2. Prerequisites

1. **Clone or local** Supabase running (see [SPRINT4_CLONE_STANDUP.md](./SPRINT4_CLONE_STANDUP.md) for clone).
2. **Service role key** for that environment only (from `supabase status` locally, or clone Dashboard → Settings → API).
3. Copy env template:

   ```bash
   cp rls-validation/release/.env.auth.example rls-validation/release/.env.auth
   # Fill SUPABASE_URL + SERVICE_ROLE_KEY (local or approved clone only)
   ```

4. Confirm URL is **not** Production before any write.

---

## 3. Phase I — Inventory (read-only)

### I.1 Run SQL inventory

Connect to the **Auth database** (local: port from `supabase status`; clone: approved connection only).

```bash
# Example: local via psql (adjust port from `supabase status`)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f rls-validation/release/auth-inventory.sql
```

Save the result set (CSV or copy) as the **claim audit baseline**.

### I.2 Classify each user

| Bucket | Criteria | Action |
|--------|----------|--------|
| **A — Ready** | Authz keys only in `app_metadata`; shape matches target (§4) | Verify JWT after re-login only |
| **B — Split needed** | Human runs PMS as `super_admin` / SA today | Provision **separate** company login (§5.1) |
| **C — Owner legacy** | `role` / `owner_crm_id` in `user_metadata` | Promote to `app_metadata` (§5.3) |
| **D — SA normalize** | Platform admin with `super_admin` or mixed metadata | Normalize SA (§5.2) |
| **E — Incomplete** | Company/owner persona missing `company_id` or `owner_crm_id` | Fix in CRM + promote; do not ship |

### I.3 Exit inventory when

- [ ] Every human who needs daily PMS ops is identified for **company** login (not SA).
- [ ] Every owner portal user is mapped to `owners.id` + `owners.company_id`.
- [ ] Every SA user is listed for `platform_super_admin` normalization.
- [ ] All `user_metadata` authz keys are enumerated for strip (§5.4).

---

## 4. Target claim shapes (canonical)

Trusted path: **service role / Admin API only**. Never client `updateUser` or `signUp.options.data` for authz.

| Persona | `app_metadata` | Forbidden |
|---------|----------------|-----------|
| **Platform SA** | `{ "role": "platform_super_admin" }` | `company_id`, PMS auto-stamp |
| **ALODILA / company ops** | `{ "role": "company", "company_id": "a1000000-a10d-4000-8000-000000000001" }` | Authz in `user_metadata` |
| **Owner portal** | `{ "role": "owner", "owner_crm_id": "<owners.id>", "company_id": "<owners.company_id>" }` | Role via client signup |
| **Staff (future)** | `{ "role": "company_staff", "company_id": "<uuid>" }` | Bare `staff` — **not** accepted by 006 V2 `is_company_login()` |

**Cutover alias (read only during window):** `super_admin` ≡ `platform_super_admin`. **Write only** `platform_super_admin` on new/rotated SA users.

Detail: [SPRINT4_JWT_CLAIM_MODEL.md](./SPRINT4_JWT_CLAIM_MODEL.md) §1.

---

## 5. Phase P — Ordered promote steps (clone / local)

Execute **in order**. Default every promote is **dry-run** first.

### P.0 Dry-run (always first)

```bash
# From repo root; env vars from .env.auth or shell export
node rls-validation/release/auth-promote.local.mjs \
  --users rls-validation/release/users.promote.json
```

Local Docker smoke (seeded users already have `app_metadata`):

```bash
# Uses GoTrue Admin HTTP (no supabase-js). Refuses Production ref.
SUPABASE_URL=http://127.0.0.1:54321 \
SERVICE_ROLE_KEY=<from supabase status> \
node rls-validation/release/auth-promote.local.mjs \
  --users rls-validation/release/users.promote.local.seed.json
```

Review `REFUSED` / `WOULD_APPLY` lines. Fix JSON shapes before apply.

### P.1 ALODILA company login

1. Create or pick a **dedicated** Auth user (email **≠** Platform SA).
2. Add to `users.promote.json`:

   ```json
   [
     {
       "email": "alodila-ops@your-clone-domain.test",
       "app_metadata": {
         "role": "company",
         "company_id": "a1000000-a10d-4000-8000-000000000001"
       }
     }
   ]
   ```

3. Dry-run → apply (§6).

### P.2 Platform SA normalize

For each Platform SA account:

```json
{
  "email": "platform-admin@your-clone-domain.test",
  "app_metadata": {
    "role": "platform_super_admin"
  }
}
```

- Ensure **`company_id` is absent** from `app_metadata` after promote.
- Strip authz from `user_metadata` (script does this on apply).

### P.3 Owner promote

For each owner Auth user (match CRM row):

```json
{
  "email": "owner@example.test",
  "app_metadata": {
    "role": "owner",
    "owner_crm_id": "<owners.id uuid>",
    "company_id": "<owners.company_id uuid>"
  }
}
```

Validate `company_id` matches `owners.company_id` for `owner_crm_id`.

### P.4 Strip `user_metadata` authz

On **apply**, the promote script removes `role`, `company_id`, and `owner_crm_id` from `user_metadata` while preserving display prefs (name, locale, etc.).

Re-run **inventory SQL** §3 — bucket **E** (authz in `user_metadata`) must be **zero**.

### P.5 Force JWT refresh

After apply:

1. Revoke sessions (Dashboard → Auth → user → sign out all), **or**
2. Have each user sign out and sign in again.

Claims are stale until refresh. See [SPRINT4_JWT_CLAIM_MODEL.md](./SPRINT4_JWT_CLAIM_MODEL.md) §3.2.

---

## 6. Apply promote (clone / local only)

```bash
# Required flags together:
node rls-validation/release/auth-promote.local.mjs \
  --users rls-validation/release/users.promote.json \
  --apply \
  --i-understand-clone
```

**Requires:** `SUPABASE_URL` + `SERVICE_ROLE_KEY` in environment.

**Host rules (script-enforced):**

| Condition | Result |
|-----------|--------|
| URL contains `ryfqqyrqmsyngwcsfjug` | **REFUSE** (always) |
| URL contains `supabase.co` without `ALLOW_NON_LOCAL_AUTH_PROMOTE=YES` | **REFUSE** |
| URL is not `127.0.0.1` / `localhost` and `ALLOW_NON_LOCAL_AUTH_PROMOTE≠YES` | **REFUSE** |
| Approved clone (`ALLOW_NON_LOCAL_AUTH_PROMOTE=YES`, non-prod ref) | Allowed |
| `--apply` without `--i-understand-clone` | **REFUSE** |

---

## 7. Verification checklist (JWT claim inspection)

After promote + re-login, for **each** persona verify JWT `app_metadata` (browser DevTools → Application → session, or jwt.io on access token **in clone only**).

| # | Persona | Check `app_metadata` | Must NOT appear in `user_metadata` |
|---|---------|----------------------|-----------------------------------|
| V1 | Company ops | `role=company`, `company_id=ALODILA UUID` | `role`, `company_id` |
| V2 | Platform SA | `role=platform_super_admin`, no `company_id` | `role`, `company_id`, `owner_crm_id` |
| V3 | Owner | `role=owner`, `owner_crm_id`, `company_id` | same three keys |
| V4 | RLS company path | Login as company → staff console `/` lists only ALODILA rows | — |
| V5 | RLS SA path | Login as SA → `/platform/*` works; unscoped PMS denied post Phase C | — |
| V6 | Owner portal | Owner login → portal reads under RLS | — |
| V7 | Inventory clean | Re-run `auth-inventory.sql` — no `user_metadata` authz | — |
| V8 | Local harness | `npm run local:validate` → 22/22 PASS (if local stack) | — |

**App alignment:** `src/lib/auth/roles.js` reads `app_metadata` only; `isCompanyOperatorUser` matches SQL (`company` \| `company_admin` \| `company_staff`).

---

## 8. Gate A merge point

This kit completes **S1 (Auth bind)** in [SPRINT5_AUTH_CUTOVER_PLAN.md](./SPRINT5_AUTH_CUTOVER_PLAN.md) §0. Do **not** call Hard isolation done until:

- [ ] V1–V7 PASS on clone
- [ ] ALODILA smoke on **company** login (not SA)
- [ ] Isolation matrix uses CA/CB/OA/OB — not SA dual-visibility

Prod execution repeats §3–§7 **only** after clone PASS + written approval (S7 in Sprint 5 plan).

---

## 9. Rollback (clone)

| Step | Action |
|------|--------|
| 1 | Export pre-promote inventory snapshot |
| 2 | Re-apply previous `app_metadata` via dry-run JSON + `--apply` |
| 3 | Force re-login |
| 4 | Re-run `auth-inventory.sql` + isolation smoke |

Do **not** use Soft RLS + SA bypass as long-term rollback. See Sprint 5 plan §7.

---

## 10. Example `users.promote.json`

```json
[
  {
    "email": "alodila-ops@local.alodila.test",
    "app_metadata": {
      "role": "company",
      "company_id": "a1000000-a10d-4000-8000-000000000001"
    }
  },
  {
    "email": "sa@local.alodila.test",
    "app_metadata": {
      "role": "platform_super_admin"
    }
  },
  {
    "email": "owner-a@local.alodila.test",
    "app_metadata": {
      "role": "owner",
      "owner_crm_id": "a0a00000-0000-4000-8000-0000000000a1",
      "company_id": "a1000000-a10d-4000-8000-000000000001"
    }
  }
]
```

Store promote JSON outside git if it contains real clone emails. **Do not commit** service role keys or production passwords.

---

## 11. Human steps remaining after kit

1. **Clone standup** (if not local) — restore DB; obtain non-prod service role key.
2. **Claim audit** — run inventory SQL; triage buckets A–E.
3. **Build `users.promote.json`** — company login, SA normalize, owners.
4. **Dry-run → apply** — promote script on approved host only.
5. **Session revoke** — all promoted users re-login.
6. **JWT verification** — checklist §7.
7. **Smoke** — company PMS + platform routes + owner portal on clone.
8. **Re-run isolation matrix** — CA/CB/OA/OB actors ([SPRINT4_QA_ISOLATION_TEST_PLAN.md](./SPRINT4_QA_ISOLATION_TEST_PLAN.md)).
9. **Written approval** — only then plan prod promote (separate change window).
