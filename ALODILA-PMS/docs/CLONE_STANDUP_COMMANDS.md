# Clone Stand-up — Command Checklist

**Product:** ALODILA-PMS  
**Document type:** Concrete operator commands (bash / psql / Supabase CLI patterns)  
**Status:** DOCUMENTATION ONLY — **do not execute** from this doc without explicit approval  
**Narrative runbook:** `docs/SPRINT4_CLONE_STANDUP.md`  
**Rollback after 006:** `docs/ROLLBACK_PACK_SOFT_RLS.md`

---

## 0. Hard rules

| # | Rule |
|---|------|
| C1 | Production ref **`ryfqqyrqmsyngwcsfjug`** is **SOURCE ONLY** (read / dump). **Never** the write/restore/migrate target. |
| C2 | Reject **"streak up"** and any non-approved project as clone. |
| C3 | **Never** restore stale dumps dated **`20260803`** (pre Packages 1–5 / no trustworthy `company_id` backfill). |
| C4 | Redact secrets in logs, chat, and commits. Placeholders below: `<PASSWORD>`, `<CLONE_REF>`, `<ANON_KEY>`. |
| C5 | Do **not** overwrite Vercel Production env with clone URLs/keys. |
| C6 | This file is a checklist. **Do not execute** commands while only reading this doc. |

**Stop condition:** Active DB URL or Supabase link shows `ryfqqyrqmsyngwcsfjug` as write target during restore / seed / `006` → abort.

---

## 1. Prerequisites (local tools)

```bash
# Verify tooling (local machine)
psql --version
pg_dump --version
pg_restore --version
supabase --version   # optional; Dashboard UI is fine if CLI not used
```

Secrets live in gitignored files (e.g. `backups/db-connection.local.env`). **Never** paste real passwords into this checklist after filling it in.

---

## 2. Create clone project

### 2.1 Dashboard (preferred)

1. Supabase Dashboard → **New project**  
2. Name: e.g. `ALODILA-PMS-clone-sprint4-YYYYMMDD`  
3. Region: prefer **`ap-northeast-1`** (match prod pooler)  
4. New DB password → password manager only  
5. Wait until **Healthy**  
6. Record offline: `<CLONE_REF>`, API URL, anon key, service_role (admin only)

### 2.2 Supabase CLI pattern (optional)

```bash
# EXAMPLE ONLY — do not run without approval / org context
# supabase projects create "ALODILA-PMS-clone-sprint4-YYYYMMDD" \
#   --org-id "<ORG_ID>" \
#   --region "ap-northeast-1" \
#   --db-password "<CLONE_DB_PASSWORD>"

# After create, link LOCAL worktree to CLONE (never to prod for write work):
# supabase link --project-ref "<CLONE_REF>"
```

### 2.3 Reject list check

```text
[ ] Target ref ≠ ryfqqyrqmsyngwcsfjug
[ ] Target name ≠ "streak up" / similar
[ ] Region noted (prefer ap-northeast-1)
```

---

## 3. Fresh dump from production (SOURCE ONLY)

### 3.1 Stale dump warning

| Artifact | Status |
|----------|--------|
| `backups/alodila-pms-freeze-20260803.dump` | **STALE — DO NOT USE** |
| `backups/alodila-pms-freeze-20260803.sql` | **STALE — DO NOT USE** |
| `backups/alodila-pms-prod-20260803-*.dump` | **STALE — DO NOT USE** |

Those dumps are **before** Packages 1–5. Restoring them for Sprint 4 clone work is invalid.

### 3.2 Pre-dump read-only probes on SOURCE

Connect with **read-only** intent to prod pooler. Example DSN shape (secrets redacted):

```text
postgresql://postgres.ryfqqyrqmsyngwcsfjug:<PASSWORD>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
```

```bash
# READ-ONLY against SOURCE (prod). Confirm Packages 1–5 / company_id exist.
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
select id, name from public.companies
where id = 'a1000000-a10d-4000-8000-000000000001';
"

psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
select table_name
from information_schema.columns
where table_schema = 'public' and column_name = 'company_id'
  and table_name in (
    'owners','tenants','properties','units','meters',
    'contracts','invoices','payments','maintenance_requests'
  )
order by 1;
"
```

Confirm **006 not applied** on prod (no leftover soft-company policies expected):

```bash
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
select count(*) as company_soft_policies
from pg_policies
where schemaname = 'public'
  and (policyname like '%_company_%' or policyname = 'owners_owner_self_select');
"
```

### 3.3 Custom-format dump (SOURCE → local file)

```bash
# SOURCE ONLY. Write dump to local disk — never restore back into prod.
export DUMP_FILE="backups/alodila-pms-prod-AFTER-P5-$(date -u +%Y%m%d-%H%M%S).dump"

pg_dump "$PROD_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$DUMP_FILE"

# List contents (sanity)
pg_restore -l "$DUMP_FILE" | head -n 50

# Reject if filename/path still looks like 20260803 freeze
# Reject if file size is tiny / list empty
```

PowerShell variant (Windows):

```powershell
# SOURCE ONLY — secrets from env / secret file, not committed
$DumpFile = "backups/alodila-pms-prod-AFTER-P5-{0:yyyyMMdd-HHmmss}.dump" -f (Get-Date).ToUniversalTime()
pg_dump $env:PROD_DATABASE_URL --format=custom --no-owner --no-acl --file=$DumpFile
pg_restore -l $DumpFile | Select-Object -First 50
```

### 3.4 Dump acceptance gate

```text
[ ] Filename date ≠ 20260803 family
[ ] pg_restore -l shows public.owners / properties / contracts / invoices
[ ] Operator recorded UTC time + SOURCE ref ryfqqyrqmsyngwcsfjug (read-only)
```

---

## 4. Restore onto clone (TARGET = `<CLONE_REF>` only)

```bash
# Double-check: connection user/host MUST contain <CLONE_REF>, NOT ryfqqyrqmsyngwcsfjug
echo "$CLONE_DATABASE_URL" | grep -E 'ryfqqyrqmsyngwcsfjug' && echo "ABORT: prod ref in clone URL" && exit 1

pg_restore \
  --dbname="$CLONE_DATABASE_URL" \
  --no-owner \
  --no-acl \
  --verbose \
  "backups/alodila-pms-prod-AFTER-P5-YYYYMMDD-HHMMSS.dump"
```

Notes:

- Non-fatal role/extension noise is common; abort if core PMS tables missing.  
- Plan to **recreate** Auth personas on clone even if some `auth.users` appear.  
- **Do not** re-run `005_*` on a good AFTER-P5 dump.

### 4.1 Optional: mark migration history without re-applying 005

Prefer documenting “schema-from-dump; apply only 006 later” over blind `supabase db push` of full history.

```bash
# OPTIONAL — only if your process requires supabase_migrations rows
# supabase migration list --linked   # linked to CLONE, never prod write
# Do NOT db push entire historical chain against a restored DB without a plan
```

---

## 5. `.env.clone` template (redacted)

Create **gitignored** `ALODILA-PMS/.env.clone` (never commit real keys):

```env
# .env.clone — CLONE ONLY — never copy into Vercel Production
# Must NOT contain ryfqqyrqmsyngwcsfjug

VITE_SUPABASE_URL=https://<CLONE_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<CLONE_ANON_KEY>
VITE_OWNER_AUTH_EMAIL_DOMAIN=owner.alodila.local

# Optional AI — non-prod key or omit
# GROQ_API_KEY=
# VITE_GROQ_API_KEY=
```

Local load patterns:

```bash
# Prefer dedicated worktree so prod .env.local is not overwritten permanently
cp .env.clone .env.local   # operator workstation / clone worktree only
npm run dev
```

```powershell
Copy-Item .env.clone .env.local
npm run dev
```

Safety grep:

```bash
# Must print nothing (or ABORT)
grep -n "ryfqqyrqmsyngwcsfjug" .env.clone && echo "ABORT: prod ref in .env.clone"
```

| Action | Allowed? |
|--------|----------|
| Local `.env.clone` | YES |
| Commit real keys | NO |
| Point Vercel **Production** at clone | NO |
| Vercel Preview → clone | Only with written approval |

---

## 6. Post-restore verification SELECTs (clone — read-only)

All of the following target **`$CLONE_DATABASE_URL`** only.

```bash
psql "$CLONE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
-- ALODILA seed
select id, name, is_deleted
from public.companies
where id = 'a1000000-a10d-4000-8000-000000000001';

-- company_id present (Package 1–5 equivalent)
select table_name
from information_schema.columns
where table_schema = 'public' and column_name = 'company_id'
  and table_name in (
    'owners','tenants','properties','units','meters',
    'contracts','invoices','payments','maintenance_requests'
  )
order by 1;

-- Soft-NULL residual counts (expect ~0 after P5)
select 'owners' as t, count(*) filter (where company_id is null) as nulls from public.owners where is_deleted = false
union all select 'tenants', count(*) filter (where company_id is null) from public.tenants where is_deleted = false
union all select 'properties', count(*) filter (where company_id is null) from public.properties where is_deleted = false
union all select 'units', count(*) filter (where company_id is null) from public.units where is_deleted = false
union all select 'meters', count(*) filter (where company_id is null) from public.meters where is_deleted = false
union all select 'contracts', count(*) filter (where company_id is null) from public.contracts where is_deleted = false
union all select 'invoices', count(*) filter (where company_id is null) from public.invoices where is_deleted = false
union all select 'payments', count(*) filter (where company_id is null) from public.payments where is_deleted = false
union all select 'maintenance_requests', count(*) filter (where company_id is null) from public.maintenance_requests where is_deleted = false;

-- Soft RLS not yet applied (pre-006 baseline)
select count(*) as company_soft_policies
from pg_policies
where schemaname = 'public'
  and (policyname like '%_company_%' or policyname = 'owners_owner_self_select');

-- Rough row counts (compare ballpark to prod Package 5 validation)
select 'owners' as t, count(*) from public.owners
union all select 'properties', count(*) from public.properties
union all select 'contracts', count(*) from public.contracts
union all select 'invoices', count(*) from public.invoices
union all select 'payments', count(*) from public.payments;
SQL
```

Pre-006 policy dump (required before applying 006 V2) — see `ROLLBACK_PACK_SOFT_RLS.md` §2.

---

## 7. Apply 006 on clone only (later phase — not stand-up exit)

Order when isolation campaign starts:

```text
1) Baseline smoke via .env.clone (ALODILA)
2) Capture pg_policies dump (ROLLBACK pack §2)
3) Apply 006_sprint4_soft_rls_v2.sql on CLONE connection only
4) Apply 006b … CONCURRENTLY statements OUTSIDE a transaction
5) Isolation QA (CA/CB/OA/OB) — never judge PASS by Super Admin visibility
```

```bash
# EXAMPLE — clone only; never point at prod
# psql "$CLONE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/006_sprint4_soft_rls_v2.sql
# Then each 006b statement separately (no BEGIN/COMMIT around CONCURRENTLY)
# psql "$CLONE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/006b_sprint4_wave_a_indexes_concurrent.sql
```

**Forbidden:**

```bash
# DO NOT — production write target
# psql "$PROD_DATABASE_URL" -f supabase/migrations/006_sprint4_soft_rls_v2.sql
```

---

## 8. Auth personas (clone Dashboard / Admin API)

Create on **clone** Auth only. Claims in **`app_metadata`** (trusted):

| ID | `app_metadata` (target) |
|----|-------------------------|
| CA | `role=company`, `company_id=a1000000-a10d-4000-8000-000000000001` |
| CB | `role=company`, `company_id=<COMPANY_B_ID>` |
| OA | `role=owner`, `owner_crm_id=<ALODILA_OWNER_CRM_ID>` |
| OB | `role=owner`, `owner_crm_id=<OWNER_B_CRM_ID>`, `company_id=<COMPANY_B_ID>` |

SA is for seed / platform smoke — **not** isolation evidence.

```bash
# Conceptual Admin API pattern (clone service_role only — never in browser / VITE_*)
# curl -X PUT "https://<CLONE_REF>.supabase.co/auth/v1/admin/users/<USER_ID>" \
#   -H "Authorization: Bearer <CLONE_SERVICE_ROLE>" \
#   -H "apikey: <CLONE_SERVICE_ROLE>" \
#   -H "Content-Type: application/json" \
#   -d '{"app_metadata":{"role":"company","company_id":"<UUID>"}}'
```

---

## 9. Stand-up complete checklist

```text
[ ] Clone project created; ref recorded; not prod; not "streak up"
[ ] Fresh AFTER-P5 dump used (NOT 20260803)
[ ] Restore targeted <CLONE_REF> only
[ ] Verification SELECTs green (ALODILA + company_id + ~0 NULLs)
[ ] .env.clone redacted template filled; prod ref absent
[ ] Vercel Production untouched
[ ] No writes to ryfqqyrqmsyngwcsfjug
[ ] 006 not applied yet (or applied only on clone with dump + approval)
[ ] Secrets not committed (git status clean of .env* / *.dump)
```

---

## 10. Destroy / soft rollback (clone only)

```text
Soft: revert 006 via ROLLBACK_PACK_SOFT_RLS.md on clone; fix .env; fix Auth claims
Hard: Dashboard → Project Settings → Delete project (confirm CLONE ref, not prod)
```

Never reverse-sync clone data into `ryfqqyrqmsyngwcsfjug`.

---

## 11. Related docs

| Doc | Role |
|-----|------|
| `SPRINT4_CLONE_STANDUP.md` | Full narrative stand-up |
| `ROLLBACK_PACK_SOFT_RLS.md` | 006 V2 + 006b rollback |
| `SPRINT4_ISOLATION_QA.md` | Isolation matrix |
| `SPRINT4_RLS_POLICY_INVENTORY.md` | Live policy names |

---

**Reminder:** Commands above are patterns for an approved operator. This document must not be treated as permission to dump, restore, link, or migrate. Production `ryfqqyrqmsyngwcsfjug` remains **SOURCE ONLY**. Stale **`20260803`** dumps must not be restored.
