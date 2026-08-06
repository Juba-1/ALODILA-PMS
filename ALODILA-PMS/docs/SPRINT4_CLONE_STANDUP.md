# Sprint 4 — Clone Stand-up Guide

**Product:** ALODILA-PMS  
**Document type:** Clone preparation runbook (documentation only — **do not create the clone from this doc alone without explicit approval**)  
**Status:** READY FOR EXECUTION when Packages 1–5 are closed on prod and an operator is assigned  
**Production project (READ-ONLY during clone work):** `ryfqqyrqmsyngwcsfjug`  
**ALODILA company UUID:** `a1000000-a10d-4000-8000-000000000001`  
**Preferred clone region:** `ap-northeast-1` (match production)  
**Governing docs:** `SPRINT3_TENANCY_EXECUTION.md` · `SPRINT4_STREAM_D_PACKAGE.md` · `SPRINT4_QA_ISOLATION_TEST_PLAN.md` · `SPRINT4_ISOLATION_QA.md` · `SPRINT4_RLS_IMPLEMENTATION_CHECKLIST.md`

---

## 0. Hard rules (non-negotiable)

| # | Rule |
|---|------|
| H1 | **Never write** to production `ryfqqyrqmsyngwcsfjug` during clone stand-up, seed, migration 006, or isolation proof. Reads for dump/verify only. |
| H2 | **Reject** any use of the **"streak up"** (or similarly named) Supabase project. Wrong project = stop. |
| H3 | Clone is the **only** place for Company B seed, Auth persona experiments, and `006` soft RLS apply. |
| H4 | **Never overwrite** production Vercel env vars with clone URLs/keys. Use a separate local `.env.clone` (or a dedicated Preview env if explicitly approved). |
| H5 | Prefer **`app_metadata`** for authorization claims. Do **not** put isolation claims only in editable `user_metadata`. |
| H6 | Do **not** re-run Package 1–5 (`005_*`) migrations on a dump that already contains them. |
| H7 | Do **not** apply `006_sprint4_soft_rls_and_indexes.sql` to production until clone isolation matrix PASSes + written approval. |
| H8 | Isolation PASS/FAIL is judged by **CA / CB / OA / OB only** — never by Super Admin dual visibility. |

**Stop condition:** If any tool, MCP, CLI, or dashboard tab shows project ref `ryfqqyrqmsyngwcsfjug` as the **write** target during clone work → abort, reconnect to the clone, and record the near-miss.

---

## 1. Purpose & exit of this stand-up

Stand-up delivers an isolated Supabase project that:

1. Holds a **fresh** logical copy of production **after** Sprint 3 Packages 1–5.
2. Is safe for Stream D soft RLS (`006`) and two-company isolation QA.
3. Has local app wiring via `.env.clone` without touching prod Vercel.
4. Has Auth personas **CA / CB / OA / OB** ready (CB/OB after Company B seed).

**Stand-up exit (before isolation matrix):** clone reachable · Packages 1–5 state verified · baseline ALODILA smoke recorded · env pointed at clone · secrets stored safely · destroy/rollback path known.

This document **does not** create the clone; it is the checklist operators follow when creation is approved.

---

## 2. Project creation (new Supabase project)

### 2.1 Create

1. Open Supabase Dashboard → **New project**.
2. Organization: same org as ALODILA-PMS (or the approved staging org).
3. Name: e.g. `ALODILA-PMS-clone-sprint4` (include date if helpful: `…-20260804`).
4. **Region:** prefer **`ap-northeast-1`** (Tokyo) — same as production pooler host `aws-1-ap-northeast-1`.
5. Generate a **new** strong DB password; store it only in the secrets store (§7). Do not reuse prod password in chat/docs.
6. Wait until project is **Healthy**.
7. Record and keep offline:
   - Clone **project ref** (e.g. `xxxxxxxxxxxx`)
   - Clone **API URL** `https://<ref>.supabase.co`
   - Clone **anon** / **service_role** keys (Dashboard → Settings → API)
   - Clone DB connection (prefer Session Pooler IPv4 if on IPv4-only networks)

### 2.2 Reject list

| Target | Action |
|--------|--------|
| `ryfqqyrqmsyngwcsfjug` (prod) | **Do not** create “clone” work here; **do not** write |
| **"streak up"** / any non-ALODILA clone project | **Reject** — wrong baseline |
| Random existing unused project | **Reject** unless it was created for this Sprint 4 clone and is empty/known |

### 2.3 Post-create sanity (clone only)

- [ ] Project name and ref written in the run log
- [ ] Region confirmed `ap-northeast-1` (or documented waiver if unavailable)
- [ ] Confirmed **not** prod ref and **not** “streak up”
- [ ] Dashboard URL bookmarked as **CLONE** (label clearly)

---

## 3. Fresh dump from production (after Packages 1–5)

### 3.1 Stale dump warning

| Artifact (repo `backups/`) | Status |
|----------------------------|--------|
| `alodila-pms-freeze-20260803.dump` | **STALE** — taken **before** Packages 1–5 (`company_id` backfill) |
| `alodila-pms-freeze-20260803.sql` | **STALE** — same |
| `alodila-pms-prod-20260803-173015.dump` | **STALE** — same date family |

**Do not restore any `20260803` dump for Sprint 4 clone work.** Those dumps lack Package 1–5 `company_id` columns/backfill and will force incorrect re-application of `005_*` or a broken Package 5–equivalent state.

### 3.2 Preconditions before dumping prod

1. Confirm on **prod** (read-only SQL / migration history):
   - Packages 1–5 applied (`005_package_1` … `005_package_5` / versions in `SPRINT3_TENANCY_EXECUTION.md`).
   - In-scope tables have `company_id`, ALODILA backfill, FKs, still **nullable**.
2. Confirm **no** `006` soft RLS applied on prod yet (expected).
3. Schedule a short maintenance window if dump load is high (optional; logical dump is usually fine).

### 3.3 Dump steps (READ from prod only)

Use Session Pooler when IPv4-only. Connection template lives in local secret file `backups/db-connection.local.env` (never commit passwords).

1. Set env for **prod** host/user `postgres.ryfqqyrqmsyngwcsfjug` (password from Dashboard or local secret file).
2. Create a dated dump name, e.g.:

   ```text
   backups/alodila-pms-prod-AFTER-P5-YYYYMMDD-HHMMSS.dump
   ```

3. Run custom-format dump (example — adjust path/tools for your machine):

   ```bash
   pg_dump "postgresql://postgres.ryfqqyrqmsyngwcsfjug:<PASSWORD>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres" \
     --format=custom \
     --no-owner \
     --no-acl \
     --file="backups/alodila-pms-prod-AFTER-P5-YYYYMMDD-HHMMSS.dump"
   ```

4. Optionally also take a plain SQL dump for inspection (large).
5. Record: dump filename, UTC timestamp, prod project ref, Packages 1–5 confirmed, operator initials.
6. **Verify dump is not empty** (file size sanity + `pg_restore -l` lists schemas/tables).

### 3.4 Dump acceptance gate

- [ ] Filename contains date **after** Package 5 close (not `20260803`)
- [ ] `pg_restore -l` shows `public.owners` / `properties` / `contracts` / `invoices` etc.
- [ ] Spot-check later on clone: `company_id` columns exist (do **not** re-run `005_*` to “fix”)

---

## 4. Restore order (onto the new clone)

**Target:** clone project only. Double-check connection string project ref before every command.

### 4.1 Ordered steps

1. **Create** empty clone project (§2) — Healthy.
2. **Note** clone DB password and pooler host (`aws-1-ap-northeast-1.pooler.supabase.com` if same region) with user `postgres.<CLONE_REF>`.
3. **Disable** any automatic “sample data” / unnecessary seed on clone (empty Postgres is fine).
4. **Restore** the **fresh AFTER-P5** custom dump:

   ```bash
   pg_restore \
     --dbname="postgresql://postgres.<CLONE_REF>:<CLONE_PASSWORD>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres" \
     --no-owner \
     --no-acl \
     --verbose \
     "backups/alodila-pms-prod-AFTER-P5-YYYYMMDD-HHMMSS.dump"
   ```

5. Expect some non-fatal errors around roles/permissions/extensions already present — review; abort only on missing core tables or failed critical objects.
6. **Auth schema note:** logical dumps may or may not fully carry Auth users. Plan to **recreate** CA/CB/OA/OB on the clone (§6) even if some `auth.users` rows appear.
7. **Storage / Edge Functions:** out of scope unless needed for smoke; do not copy prod secrets into clone Edge env casually.
8. Record restore start/end time and any errors in the run log.

### 4.2 Post-restore DB checks (clone)

Run on **clone** only:

- [ ] `select id, name from public.companies where id = 'a1000000-a10d-4000-8000-000000000001';` → ALODILA present
- [ ] Spot NULL counts ≈ 0 on Package tables (`owners`, `tenants`, `properties`, `units`, `meters`, `contracts`, `invoices`, `payments`, `maintenance_requests`)
- [ ] FKs `*_company_id_fkey` present (or equivalent)
- [ ] Row counts in the same ballpark as prod Package 5 validation (see `SPRINT3_TENANCY_EXECUTION.md`)
- [ ] **No** soft RLS helpers/policies from `006` yet (unless you intentionally apply next)

### 4.3 What not to restore from

- Any `20260803` freeze dump
- Partial table copies from prod via write scripts
- “streak up” project as a source

---

## 5. Migration order

| Phase | What | Where | Action |
|-------|------|-------|--------|
| Already in dump | Packages 1–5 (`005_package_1` … `005_package_5`) | Clone after restore | **Do nothing** — schema + ALODILA backfill already present |
| Later (clone only) | `supabase/migrations/006_sprint4_soft_rls_and_indexes.sql` | Clone | Apply **after** baseline smoke + app Streams A–C pointed at clone; **before** two-company isolation matrix |
| Forbidden now | Re-run any `005_*` on clone | Clone | Only if dump was wrong/stale — prefer **new dump**, not re-migrate |
| Forbidden | Apply `006` to `ryfqqyrqmsyngwcsfjug` | Prod | Blocked until clone matrix PASS + approval |

### 5.1 Recommended clone sequence after restore

```
Restore AFTER-P5 dump
    → Verify Package 1–5 state (no 005 re-run)
    → Point app at clone (.env.clone)
    → Baseline smoke (ALODILA staff + owner portal) — pre-006
    → Seed Company B + synthetic rows (clone only)
    → Provision Auth CA/CB/OA/OB (app_metadata)
    → Apply 006 on clone only (helpers → SELECT → INSERT/UPDATE per Stream D)
    → Isolation matrix (SPRINT4_ISOLATION_QA.md)
    → Production 006 only after PASS + written approval
```

### 5.2 If `supabase_migrations` history is missing/mismatched on clone

1. Do **not** blindly `db push` all historical migrations against a restored DB.
2. Prefer marking Packages 1–5 as already applied (manual history insert) **or** document “schema-from-dump; apply only 006”.
3. When applying `006`, use a controlled SQL apply against the **clone** connection only.

---

## 6. Auth users / `app_metadata` claims (CA / CB / OA / OB)

Create users on the **clone** Auth project (Dashboard → Authentication → Users, or Admin API with **clone** `service_role`).

### 6.1 Claim rules

- Put authorization fields in **`app_metadata`** (trusted).
- Optional transition copies in `user_metadata` are **not** proof of isolation.
- After login, confirm JWT via `getUser()` / session inspector before any test case.
- Use one browser profile / hard sign-out per persona.

### 6.2 Isolation personas (mandatory)

| ID | Persona | `app_metadata` (target) | Purpose |
|----|---------|-------------------------|---------|
| **CA** | Company A operator | `role: "company"`, `company_id: "a1000000-a10d-4000-8000-000000000001"` | ALODILA company-scoped proofs — **not** SA |
| **CB** | Company B operator | `role: "company"`, `company_id: "<COMPANY_B_ID>"` | Primary isolation actor |
| **OA** | Owner A (ALODILA) | `role: "owner"`, `owner_crm_id: "<ALODILA_OWNER_CRM_ID>"`, optional `company_id: ALODILA` | Owner regression; no Company B |
| **OB** | Owner B (Company B) | `role: "owner"`, `owner_crm_id: "<OWNER_B_CRM_ID>"`, optional `company_id: "<COMPANY_B_ID>"` | Own portfolio inside Company B only |

### 6.3 Prep-only persona (not isolation evidence)

| ID | Claims | Use |
|----|--------|-----|
| **SA** | `role: "super_admin"` (current claim path) | Seed Company B, Platform Admin smoke, transitional ops — **never** mark isolation PASS from SA visibility |

### 6.4 Provisioning steps (clone)

1. Create email/password users for CA, CB, OA, OB (and SA if needed). Use clone-only emails (e.g. `ca+clone@…`).
2. Set `app_metadata` exactly as in §6.2 (Admin API `updateUserById` or Dashboard raw JSON if available).
3. For OA: bind `owner_crm_id` to the **restored** ALODILA owner row id.
4. For OB: create only **after** Company B owner row exists; bind that CRM id.
5. Confirm CB’s `company_id` ≠ ALODILA.
6. Confirm CA is **company**, not `super_admin`.
7. Document passwords in the secrets store only; rotate if leaked into chat.

### 6.5 Pre-flight (PF)

- [ ] PF1 Company B synthetic graph complete and tagged (`ISO-B-*`)
- [ ] PF2 CA/CB/OA/OB can sign in on clone
- [ ] PF3 CB JWT `company_id` = `COMPANY_B_ID`
- [ ] PF4 CA JWT is company-scoped (not SA)
- [ ] PF5 Known ALODILA + Company B ids recorded
- [ ] PF6 Tester acknowledges SA is not isolation evidence

---

## 7. Environment variables (`.env.clone` pattern)

### 7.1 Pattern

1. Copy from local template (e.g. `.env.local`) → **`.env.clone`** (gitignored).
2. Point **only** Vite public vars at the **clone**:

   ```env
   # .env.clone — CLONE ONLY — never copy into Vercel Production
   VITE_SUPABASE_URL=https://<CLONE_REF>.supabase.co
   VITE_SUPABASE_ANON_KEY=<CLONE_ANON_KEY>
   VITE_OWNER_AUTH_EMAIL_DOMAIN=owner.alodila.local

   # Optional AI — use a non-prod key or omit
   # GROQ_API_KEY=
   # VITE_GROQ_API_KEY=
   ```

3. Run the app loaded with clone env, e.g.:

   ```bash
   # PowerShell example
   Copy-Item .env.clone .env.local   # only on a dedicated clone workstation / branch worktree
   npm run dev
   ```

   Prefer a **separate git worktree** or clear ritual so you do not accidentally leave clone URL in the file used for prod debugging.

### 7.2 Never overwrite prod Vercel

| Action | Allowed? |
|--------|----------|
| Edit Vercel **Production** `VITE_SUPABASE_URL` / anon key to clone | **NO** |
| Edit Vercel **Preview** to clone (explicitly labeled Preview) | Only with written approval |
| Local `.env.clone` / temporary `.env.local` on operator machine | **YES** |
| Commit `.env.clone` with real keys | **NO** |

### 7.3 Operator checklist

- [ ] `.env.clone` contains clone ref only (search file for `ryfqqyrqmsyngwcsfjug` → must be **absent**)
- [ ] Prod `.env.local` / Vercel Production unchanged
- [ ] Browser network tab shows requests to `https://<CLONE_REF>.supabase.co`

---

## 8. Secrets handling

| Secret | Store where | Do not |
|--------|-------------|--------|
| Prod DB password | `backups/db-connection.local.env` (gitignored) / password manager | Paste in docs, chat, commits, screenshots |
| Clone DB password | Password manager + private run log | Reuse in public channels |
| Clone `service_role` | Password manager; use only for Auth claim set / SQL admin on clone | Put under `VITE_*` or ship to browser |
| Clone anon key | `.env.clone` (gitignored) | Commit to git |
| Dump files | Local `backups/` (ensure gitignore covers `*.dump` / secrets) | Upload dumps to public drives |
| Persona passwords | Password manager | Share in Slack/email plaintext long-term |

**Hygiene:**

1. Rotate any secret that appeared in chat or a committed file.
2. Prefer Session Pooler credentials for dump/restore; still treat as secret.
3. Never put `service_role` in Vercel frontend env.
4. After stand-up, confirm `git status` shows no secret files staged.

---

## 9. Verification checklist (stand-up complete)

### 9.1 Project & restore

- [ ] New clone project created; region preferably `ap-northeast-1`
- [ ] Confirmed **not** prod `ryfqqyrqmsyngwcsfjug` and **not** “streak up”
- [ ] Fresh **AFTER Packages 1–5** dump used (no `20260803` stale dump)
- [ ] Restore completed on clone; core tables present
- [ ] Package 1–5 equivalent state verified; **005 not re-run**
- [ ] `006` **not** on prod; apply on clone only when ready

### 9.2 Baseline smoke (pre-006, ALODILA path)

- [ ] App via `.env.clone` reaches clone
- [ ] Staff / CA-like login: dashboard loads
- [ ] Owners / properties / contracts / invoices lists load (ALODILA data)
- [ ] Owner portal (OA) loads for restored ALODILA owner
- [ ] Record timestamps / screenshots in run log

### 9.3 Ready for Stream D / isolation (next, still clone-only)

- [ ] Company B registry row + synthetic `ISO-B-*` graph (additive only)
- [ ] CA / CB / OA / OB Auth + `app_metadata` verified
- [ ] PF1–PF6 checked
- [ ] Then apply `006` on clone → run `SPRINT4_ISOLATION_QA.md`

### 9.4 Safety confirmation

- [ ] No writes issued to `ryfqqyrqmsyngwcsfjug` during this stand-up
- [ ] Vercel Production env untouched
- [ ] Secrets not committed

---

## 10. Rollback / destroy clone

### 10.1 Soft rollback (keep project)

| Situation | Action (clone only) |
|-----------|---------------------|
| Bad `006` apply | Revert soft policies per Stream D rollback notes; helpers may remain if inert |
| Bad Company B seed | Delete **synthetic Company B rows only**; never delete ALODILA prod-equivalent data as a “fix” |
| Bad Auth claims | Fix `app_metadata` on clone users or recreate users |
| Wrong env | Restore operator `.env.local` to prod values; keep `.env.clone` aside |

### 10.2 Hard destroy (retire clone)

1. Confirm you are destroying the **clone** project ref (not prod, not “streak up”).
2. Supabase Dashboard → Project Settings → **Delete project** (type confirmation name).
3. Delete local dump copies if policy requires; or archive encrypted.
4. Delete `.env.clone` or scrub keys.
5. Invalidate clone Auth passwords / keys in password manager.
6. Note destruction time in the run log.

### 10.3 Never “rollback” by writing to prod

- Do not reverse-sync clone data into `ryfqqyrqmsyngwcsfjug`.
- Do not delete Company B experiments on production (they should never exist there).
- Do not apply inverse migrations to prod to “match” a failed clone.

---

## 11. Run log template (copy per attempt)

```text
Date (UTC):
Operator:
Clone project name / ref:
Region:
Dump file used:
Dump taken at (UTC):
Prod writes during stand-up: NONE (required)
Rejected projects checked: streak up = rejected; prod = read-only
Restore result:
Package 1–5 verify:
.env.clone ref confirmed:
Baseline smoke: PASS / FAIL
Auth CA/CB/OA/OB: pending / ready
006 on clone: not applied / applied
Next: isolation QA / destroy / fix
```

---

## 12. Related documents

| Doc | Use after stand-up |
|-----|--------------------|
| `SPRINT4_STREAM_D_PACKAGE.md` | Apply `006` order; clone proof matrix |
| `SPRINT4_RLS_IMPLEMENTATION_CHECKLIST.md` | Phase checkboxes on clone |
| `SPRINT4_QA_ISOLATION_TEST_PLAN.md` | Full TC catalog |
| `SPRINT4_ISOLATION_QA.md` | Condensed isolation protocol |
| `SPRINT3_TENANCY_EXECUTION.md` | Package 1–5 expected counts / migration names |

---

**Reminder:** This stand-up guide is actionable documentation only. Creating the clone, dumping prod, restoring, seeding Company B, and applying `006` require explicit operator execution and must never target production writes on `ryfqqyrqmsyngwcsfjug`.
