# Production Release Execution Package — Sprint 4 Soft RLS

**Soft RLS pair:** `006_sprint4_soft_rls_v2.sql` → `20260805120000_fix_with_check_helpers.sql`  
**Column truth:** `contracts.secondary_unit_ids` is **jsonb** (Production + `migrations/003_contracts_secondary_units.sql`). Soft RLS helper signature is `(uuid, jsonb)` — no Production column type change required.

**SSOT companions:** `GATE_A_EXECUTION_CHECKLIST.md` · `CLONE_STANDUP_COMMANDS.md` · `AUTH_RELEASE_MIGRATION_KIT.md` · `PRODUCTION_SOFT_RLS_RUNBOOK.md` · `ROLLBACK_PACK_SOFT_RLS.md` · `SPRINT4_ISOLATION_QA.md`

---

## Required secrets / env (never commit)

| Secret | Where | Used for |
|--------|-------|----------|
| Clone DB URL | gitignored local env | dump restore, `psql` apply, policy backup |
| Clone `SUPABASE_URL` | gitignored | Auth promote, smoke |
| Clone `SERVICE_ROLE_KEY` | gitignored | Auth promote **only** |
| Clone anon key | `.env.clone` | App + smoke |
| Prod DB URL | password manager | dump **source only**; later prod apply after approval |
| Prod service role | password manager | Auth promote on prod **after** Gate A + written approval |

**Refuse list:** any URL containing `ryfqqyrqmsyngwcsfjug` during Gate A write steps.

---

## PHASE A — Gate A (CLONE ONLY) — mandatory first

### A1. Create clone project
**Action:** Supabase Dashboard → New project `ALODILA-PMS-clone-sprint4-YYYYMMDD` (prefer `ap-northeast-1`).  
**Expect:** Healthy project; `CLONE_REF` ≠ `ryfqqyrqmsyngwcsfjug`.  
**Rollback:** Delete unused clone project (no prod impact).

### A2. Fresh dump from Production (SOURCE ONLY)
```bash
# Read-only from PROD. Never restore onto prod.
pg_dump "<PROD_DATABASE_URL>" -Fc -f "backups/alodila-pms-prod-$(date +%Y%m%d).dump"
```
**Expect:** Non-empty dump dated **after** Packages 1–5 (reject `20260803` stale dumps).  
**Rollback:** Delete dump file if wrong; do not restore.

### A3. Restore into clone only
```bash
pg_restore --clean --if-exists --no-owner --no-acl -d "<CLONE_DATABASE_URL>" "backups/alodila-pms-prod-YYYYMMDD.dump"
```
**Expect:** Packages 1–5 schema present; ALODILA company row exists.  
**Rollback:** Recreate empty clone DB / new clone project; never touch prod.

### A4. Point app at clone
```bash
# Create gitignored .env.clone (see CLONE_STANDUP_COMMANDS.md §5)
# Then:
cp .env.clone .env.local   # clone worktree only
grep -n "ryfqqyrqmsyngwcsfjug" .env.clone && echo "ABORT"
```
**Expect:** `npm run dev` loads against clone URL.  
**Rollback:** Restore previous `.env.local`.

### A5. Auth promote on clone
```bash
# Fill users.promote.json from AUTH_RELEASE_MIGRATION_KIT.md
export SUPABASE_URL="https://<CLONE_REF>.supabase.co"
export SERVICE_ROLE_KEY="<CLONE_SERVICE_ROLE>"
export ALLOW_NON_LOCAL_AUTH_PROMOTE=YES

npm run auth:promote:dry -- --users rls-validation/release/users.promote.json
# Review WOULD_APPLY / REFUSED

node rls-validation/release/auth-promote.local.mjs \
  --users rls-validation/release/users.promote.json \
  --apply \
  --i-understand-clone
```
**Expect:** CA/CB/OA/OB + ALODILA company login have `app_metadata`; Auth promote refuses prod ref.  
**Rollback:** Re-run promote with prior `app_metadata` JSON; or recreate Auth users on clone.

### A6. Pre-apply `pg_policies` backup (mandatory)
```bash
psql "<CLONE_DATABASE_URL>" -v ON_ERROR_STOP=1 -f - <<'SQL' > "backups/pg_policies_pre_006v2_<CLONE_REF>_YYYYMMDD.sql.txt"
-- use query from ROLLBACK_PACK_SOFT_RLS.md §2.1
SQL
```
**Expect:** Dated backup file saved.  
**Rollback:** N/A (read-only). **Without this file, policy rollback is guesswork — do not apply Soft RLS.**

### A7. Apply Soft RLS pair on clone
```bash
psql "<CLONE_DATABASE_URL>" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/006_sprint4_soft_rls_v2.sql

psql "<CLONE_DATABASE_URL>" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260805120000_fix_with_check_helpers.sql
```
**Expect:** Helpers + policies present; no contracts recursion.  
**Rollback:** `ROLLBACK_PACK_SOFT_RLS.md` **Path B** (§3–§5.4) using A6 dump.  
**Never apply V1 / 007 / 006 alone.**

### A8. Optional indexes (off-peak, outside txn)
```bash
# From quarantine — CONCURRENTLY — NOT inside A7 transaction
psql "<CLONE_DATABASE_URL>" -v ON_ERROR_STOP=1 \
  -f supabase/quarantine/006b_sprint4_wave_a_indexes_concurrent.sql
```
**Expect:** Indexes created (or skip).  
**Rollback:** Optional index drop per `ROLLBACK_PACK_SOFT_RLS.md` §6.

### A9. Clone smoke + isolation
```bash
export SUPABASE_URL="https://<CLONE_REF>.supabase.co"
export SUPABASE_ANON_KEY="<CLONE_ANON>"
export ALLOW_CLONE_SMOKE=YES
npm run release:smoke

# Full matrix: docs/SPRINT4_ISOLATION_QA.md rows 1–10
# Actors: CA/CB/OA/OB only — never score with Super Admin
```
**Expect:** Smoke PASS; isolation rows 1–10 PASS.  
**Rollback:** Path B rollback (§A7), fix Auth/data, re-apply pair.

### A10. Written Gate A go/no-go
**Expect:** Signed decision to proceed (or stop).  
**If FAIL → stop. Do not open Phase B.**

---

## PHASE B — Production Soft RLS (only after A10 PASS + written prod approval)

### B1. Confirm target + approval
**Action:** Written approval naming `ryfqqyrqmsyngwcsfjug`; maintenance window; on-call.  
**Expect:** Approver + date recorded in `SPRINT4_PRODUCTION_READINESS.md`.  
**Rollback:** Cancel window — no SQL run.

### B2. Pre-apply prod policy backup + PITR
```bash
psql "<PROD_DATABASE_URL>" -v ON_ERROR_STOP=1 -c "<§2.1 pg_policies query>" \
  > "backups/pg_policies_pre_006v2_ryfqqyrqmsyngwcsfjug_YYYYMMDD.sql.txt"
# Also capture Dashboard PITR / backup id
```
**Expect:** Backup file + PITR point.  
**Rollback:** N/A.

### B3. Auth bind on Production (ALODILA company minimum)
```bash
# ONLY with written approval. Still uses promote tool which REFUSES prod by default.
# Production Auth bind is typically Dashboard / approved Admin path per AUTH_RELEASE_MIGRATION_KIT.md
# Do NOT use local seed passwords. Verify JWT app_metadata after re-login.
```
**Expect:** ALODILA **company** login bound; SA has no PMS `company_id`.  
**Rollback:** Restore prior `app_metadata` via Admin API.

### B4. Apply Soft RLS pair on Production
```bash
psql "<PROD_DATABASE_URL>" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/006_sprint4_soft_rls_v2.sql

psql "<PROD_DATABASE_URL>" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260805120000_fix_with_check_helpers.sql
```
**Expect:** Pair applied in same maintenance window.  
**Rollback:** `ROLLBACK_PACK_SOFT_RLS.md` Path B with B2 dump (written approval required); prefer PITR if severe.

### B5. Production smoke (ALODILA-only — no Company B)
Manual S1, S3, S5, S6, S8–S10 from `PRODUCTION_SOFT_RLS_RUNBOOK.md` §4.2.  
**Expect:** All applicable PASS.  
**Rollback:** Path B / PITR per severity.

### B6. Optional 006b on prod (off-peak)
Same as A8 against prod URL after column audit.  
**Rollback:** Index drop §6 only.

---

## Hard prohibitions

| Never | Why |
|-------|-----|
| Apply Soft RLS on prod before Gate A PASS | No rehearsal evidence |
| Apply `006` without fix migration | Contracts recursion / soft-delete breakage |
| Apply V1 / `007` in this release | Quarantined |
| Score isolation with Super Admin | SA bypass expected |
| `supabase db push` local `001` baseline onto prod | Wrong history |

---

## Repo validation (already green — re-run anytime)

```bash
npm run release:closeout    # preflight + local smoke
npm run local:validate      # full Docker reset + 22/22
```

---

*Final executable package. Repository engineering complete. Remaining work is human operational execution starting at Phase A.*
