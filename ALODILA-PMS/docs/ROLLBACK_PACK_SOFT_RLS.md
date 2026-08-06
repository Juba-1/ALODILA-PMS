# Rollback Pack — Soft RLS (006 V2 + 00601 fix + 006b)

**Product:** ALODILA-PMS  
**Document type:** Complete rollback procedure (documentation only)  
**Migrations covered:**
- `supabase/migrations/006_sprint4_soft_rls_v2.sql` (helpers + policies)
- `supabase/migrations/20260805120000_fix_with_check_helpers.sql` (SECURITY DEFINER `parent_*` helpers + company SELECT without `is_deleted=false`; additive repair on top of 006 V2)
- `supabase/migrations/006b_sprint4_wave_a_indexes_concurrent.sql` (CONCURRENTLY indexes)

**Superseded (do not apply / do not roll back as if applied):** `006_sprint4_soft_rls_and_indexes.sql` (V1 abort stub)  
**Inventory SSOT:** `docs/SPRINT4_RLS_POLICY_INVENTORY.md`  
**Companion:** `docs/SPRINT4_CLONE_STANDUP.md` · `docs/CLONE_STANDUP_COMMANDS.md`

**Validation status (as of doc update):** The **006 V2 + `20260805120000_fix_with_check_helpers.sql` pair** was exercised on **local Supabase Docker** (RLS validation harness). **Production** `ryfqqyrqmsyngwcsfjug` has **not** had these migrations applied via this pack. Do not cite fabricated query counts or PASS/FAIL outcomes here — record real results in the rollback run log (§10) when you execute.

---

## 0. Hard rules

| # | Rule |
|---|------|
| R1 | **Never run this rollback against production** `ryfqqyrqmsyngwcsfjug` **without written approval** from the project owner. Prefer clone-only rehearsal. |
| R2 | Capture a **pre-apply** `pg_policies` dump **before** applying 006 V2 (§2). Without that dump, SELECT body restore is guesswork (live names ≠ repo schema). |
| R3 | Do **not** drop Package 1–5 `company_id` columns, FKs, or solo `*_company_id_idx` indexes (§1.3). |
| R4 | Do **not** touch `companies.*` policies or contaminant `simp_*` / foreign-schema tables. |
| R5 | Preserve SA insert/update policy **names** (`*_insert_policy`, `*_update_policy`, `owners_super_admin_policy`) — rollback removes only soft-company additions and rewrites SELECT bodies from backup. |
| R6 | Index rollback (006b) is **optional** and independent of policy rollback. |
| R7 | **`20260805120000_fix_with_check_helpers.sql` does not replace 006 V2** — it patches WITH CHECK recursion and company SELECT soft-delete behavior. Full rollback always targets **pre-006 V2** policy bodies from the §2 dump, not intermediate 006 V2-only bodies. |

**Stop condition:** If the active connection project ref is `ryfqqyrqmsyngwcsfjug` and approval is missing → abort.

---

## 1. When to use this pack

### 1.1 Rollback paths (choose one)

| Path | Migrations applied on target | Rollback scope | Sections |
|------|------------------------------|----------------|----------|
| **A — 006 V2 only** | `006_sprint4_soft_rls_v2.sql` (± optional 006b indexes) | Drop all `*_company_*` + `owners_owner_self_select`; restore pre-006 V2 SELECT bodies from §2 dump; leave or optionally drop 006 V2 **core** helpers (`is_company_login`, `current_company_id`, …). **No** `parent_*` helpers exist yet. | §2 → §3 → §4 → §5.1–§5.2 → §7 (± §6) |
| **B — 006 V2 + fix** | `006_sprint4_soft_rls_v2.sql` **then** `20260805120000_fix_with_check_helpers.sql` (± optional 006b) | Same as Path A **plus** drop fix-migration helpers (`parent_*`, `secondary_units_same_company`) after policies no longer reference them (§5.4). Company INSERT/UPDATE/SELECT policies from the fix migration are removed by the same §3 drop list — restore still comes from the **pre-006 V2** §2 dump, not from 006 V2 or fix SQL files. | §2 → §3 → §4 → §5 (all) → §7 (± §6) |

| Situation | Action |
|-----------|--------|
| Path A on **clone**; isolation / smoke FAIL | Run §3–§5.2, verify §7 |
| Path B on **local Docker** or **clone**; need clean pre-soft-RLS state | Run §3–§5.4, verify §7 |
| 006b indexes applied; want clean clone | Optional index drop (§6) — independent of A vs B |
| Either path on **prod** (should be rare) | Written approval required; same steps; prefer restore from pre-apply backup if available |
| 006 never applied | Nothing to roll back; skip |
| Fix migration applied **without** 006 V2 | **Invalid state** — do not use this pack; restore DB from backup |

### 1.2 Path A vs Path B — what differs

| Artifact | Path A (006 V2 only) | Path B (+ fix migration) |
|----------|----------------------|---------------------------|
| `*_company_select` | 006 V2 bodies (include `is_deleted = false` for company login) | Fix migration rewrote SELECT: company login **without** `is_deleted = false` (soft-delete via UPDATE) |
| `*_company_insert` / `*_company_update` | 006 V2 inline `EXISTS` parent lookups | Fix migration: `parent_*` / `secondary_units_same_company` SECURITY DEFINER helpers |
| Extra functions | None beyond §5.1 | §5.4: seven `parent_*` + `secondary_units_same_company` |
| §3 drop list | Same policy names | Same policy names (fix only recreated subsets) |
| §4 restore source | Pre-006 V2 §2 dump | **Same** pre-006 V2 §2 dump (not 006 V2 / fix replay) |

### 1.3 What NOT to roll back (Package 1–5 tenancy columns)

Soft RLS rollback is **policy + optional helper + optional 006b index** only. The following are **out of scope** and must **remain** after any Path A or B rollback:

| Keep (do not drop / alter as “rollback”) | Source migrations | Why |
|------------------------------------------|-------------------|-----|
| `company_id uuid` column on `owners`, `tenants`, `properties`, `units`, `meters`, `contracts`, `invoices`, `payments`, `maintenance_requests` | `00501`–`00505` Package 1–5 | Tenancy data model; not part of soft RLS |
| FK constraints tying `company_id` → `companies(id)` (where Package migrations added them) | Package 1–5 | Schema integrity |
| Solo btree indexes on `company_id` (e.g. `*_company_id_idx`) from Package migrations | Package 1–5 | Query performance; unrelated to 006b “alive” indexes |
| `companies` table RLS policies (`companies_*`) | Baseline / platform | Platform admin path; explicitly untouched (R4) |
| SA `*_insert_policy`, `*_update_policy`, `owners_super_admin_policy` **names** | Baseline | Only soft-company **additions** are dropped; SA policies restored from dump if 006 V2 rewrote SELECT siblings only |

**Never** run `ALTER TABLE … DROP COLUMN company_id` or drop Package FKs/indexes as a substitute for this pack.

---

## 2. Pre-apply policy backup (MANDATORY before 006 V2)

Run on the **target** database (clone before apply; prod only if apply is approved) and save output to a dated file **before** `006_sprint4_soft_rls_v2.sql`.

If you later apply `20260805120000_fix_with_check_helpers.sql` on the same target, an **optional second dump** before the fix migration helps audit intermediate state — but **full rollback still uses the pre-006 V2 file** from this section.

### 2.1 Policy backup capture — dump query

```sql
-- SAVE OUTPUT: backups/pg_policies_pre_006v2_<TARGET_REF>_YYYYMMDD_HHMMSS.sql.txt
-- READ-ONLY. Capture BEFORE applying 006_sprint4_soft_rls_v2.sql

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual::text as using_expr,
  with_check::text as with_check_expr
from pg_policies
where schemaname = 'public'
  and tablename in (
    'owners',
    'tenants',
    'properties',
    'units',
    'meters',
    'contracts',
    'invoices',
    'payments',
    'maintenance_requests',
    'companies'
  )
order by tablename, policyname;
```

### 2.2 Optional: function signature snapshot (helpers)

Capture **before 006 V2** so you can revert hardened helpers if needed. If Path B was applied, also snapshot **after fix** if you want a record of `parent_*` definitions (rollback still drops them in §5.4).

```sql
-- Optional companion dump for helper revert decisions
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_functiondef(p.oid) as def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_super_admin',
    'is_owner_portal_user',
    'current_owner_id',
    'current_owner_crm_id',
    'is_company_login',
    'current_company_id',
    'company_matches',
    'can_access_company_row',
    'owner_company_aligned',
    'parent_owner_in_company',
    'parent_property_in_company',
    'parent_unit_in_company',
    'parent_tenant_in_company',
    'parent_contract_in_company',
    'parent_invoice_in_company',
    'secondary_units_same_company'
  )
order by p.proname;
```

*(Pre-006 V2 snapshot will not list `parent_*` / `secondary_units_same_company` — expected.)*

### 2.3 Optional: second dump before fix migration (Path B audit only)

```sql
-- SAVE OUTPUT: backups/pg_policies_pre_00601fix_<TARGET_REF>_YYYYMMDD_HHMMSS.sql.txt
-- READ-ONLY. Optional; AFTER 006 V2, BEFORE 20260805120000_fix_with_check_helpers.sql
-- NOT used for full rollback restore — §2.1 file remains SSOT for §4
```

Same query as §2.1.

### 2.4 Acceptance checklist

- [ ] §2.1 file saved offline / gitignored backups area  
- [ ] Row count > 0 for in-scope tables  
- [ ] `companies_*` policies present (will remain untouched by rollback drops)  
- [ ] Filename includes target ref + UTC timestamp  
- [ ] If applying fix migration: note in run log whether §2.3 optional dump was taken  
- [ ] Do **not** proceed to 006 V2 apply without §2.1 file

---

## 3. Drop company_* (and related) policies added / owned by 006 V2 (+ fix)

Run inside an explicit transaction on the **approved** target (clone or local Docker by default).

Applies to **Path A and Path B** — the fix migration only recreates a subset of the same policy names.

### 3.1 Drop list (complete)

006 V2 introduces or recreates these soft-company policy names (fix migration may have dropped/recreated INSERT, UPDATE, and SELECT variants again). Drop them all:

```sql
begin;

-- OWNERS
drop policy if exists owners_company_select on public.owners;
drop policy if exists owners_owner_self_select on public.owners;
drop policy if exists owners_company_insert on public.owners;
drop policy if exists owners_company_update on public.owners;

-- TENANTS
drop policy if exists tenants_company_select on public.tenants;
drop policy if exists tenants_company_insert on public.tenants;
drop policy if exists tenants_company_update on public.tenants;

-- PROPERTIES
drop policy if exists properties_company_select on public.properties;
drop policy if exists properties_company_insert on public.properties;
drop policy if exists properties_company_update on public.properties;

-- UNITS
drop policy if exists units_company_select on public.units;
drop policy if exists units_company_insert on public.units;
drop policy if exists units_company_update on public.units;

-- METERS
drop policy if exists meters_company_select on public.meters;
drop policy if exists meters_company_insert on public.meters;
drop policy if exists meters_company_update on public.meters;

-- CONTRACTS
drop policy if exists contracts_company_select on public.contracts;
drop policy if exists contracts_company_insert on public.contracts;
drop policy if exists contracts_company_update on public.contracts;

-- INVOICES
drop policy if exists invoices_company_select on public.invoices;
drop policy if exists invoices_company_insert on public.invoices;
drop policy if exists invoices_company_update on public.invoices;

-- PAYMENTS
drop policy if exists payments_company_select on public.payments;
drop policy if exists payments_company_insert on public.payments;
drop policy if exists payments_company_update on public.payments;

-- MAINTENANCE
drop policy if exists maintenance_company_select on public.maintenance_requests;
drop policy if exists maintenance_company_insert on public.maintenance_requests;
drop policy if exists maintenance_company_update on public.maintenance_requests;

-- Do NOT drop companies.* policies
-- Do NOT drop owners_super_admin_policy
-- Do NOT drop SA *_insert_policy / *_update_policy names

commit;
```

### 3.2 Sanity after drop

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (
    policyname like '%_company_%'
    or policyname = 'owners_owner_self_select'
  )
order by tablename, policyname;
-- Expect: 0 rows (operator records actual count in run log — do not invent)
```

---

## 4. Restore SELECT (and any rewritten) policy bodies from pre-apply dump

006 V2 **rewrites** live SELECT policies in place (not only adds `*_company_*`). The fix migration **does not** rewrite those legacy SELECT policies — it only replaces `*_company_select` (dropped in §3). After §3, rewritten **legacy** SELECT policies still carry V2 `USING` bodies. Restore from the **§2.1 pre-006 V2 dump**, not from repo schema alone (live names differ — e.g. `owner_view_own_properties`).

### 4.1 Policies whose bodies must be restored from dump

| Table | Policy name(s) rewritten by 006 V2 |
|-------|-------------------------------------|
| `tenants` | `tenants_select_policy` |
| `properties` | `owner_view_own_properties` (also dropped repo twin `properties_select_policy` if present) |
| `units` | `owner_view_own_units`, `units_select_policy` |
| `meters` | `meters_select_policy` |
| `contracts` | `contracts_select_policy` |
| `invoices` | `invoices_select_policy` |
| `payments` | `payments_select_policy` |
| `maintenance_requests` | `maintenance_select_policy` |

*(Path B: `*_company_select` bodies are **not** restored — they are removed in §3. Legacy rows above still need §2.1 restore.)*

### 4.2 Restore procedure

1. Open the §2.1 pre-apply dump file.  
2. For each row in §4.1, reconstruct:

   ```sql
   drop policy if exists <policyname> on public.<tablename>;
   create policy <policyname> on public.<tablename>
   for <cmd> to <roles>
   using (<using_expr from dump>);
   -- add WITH CHECK only if dump with_check_expr was non-null
   ```

3. Prefer pasting exact `qual` / `with_check` text from the dump.  
4. Leave SA `*_insert_policy` / `*_update_policy` and `owners_super_admin_policy` alone unless the dump shows they were accidentally altered (006 V2 should not have changed them).  
5. Re-run the §2.1 dump query; diff against the saved pre-apply file until SELECT policies match.

### 4.3 If pre-apply dump is missing

| Option | Risk |
|--------|------|
| Restore DB from logical backup taken before 006 | Safest if backup exists |
| Rebuild SELECT bodies from `SPRINT4_RLS_POLICY_INVENTORY.md` + live schema.sql / owner-portal RLS sources | Higher risk — inventory is summary, not full SQL |
| Leave V2 SELECT bodies + only drop `*_company_*` | **Incomplete rollback** — company helpers still tighten auth.uid / owner paths |
| Replay 006 V2 / fix migration SQL as “rollback” | **Wrong direction** — that re-applies soft RLS |

**Do not invent** permissive policies or claim verification PASS without running §7 checks. Prefer backup restore over guesswork on production.

---

## 5. Helper revert notes

006 V2 uses `CREATE OR REPLACE` on helpers. The fix migration adds SECURITY DEFINER `parent_*` helpers. Dropping policies alone does **not** restore prior function bodies.

### 5.1 Helpers introduced or hardened by 006 V2

| Function | 006 V2 role | Rollback options |
|----------|-------------|------------------|
| `is_super_admin()` | Hardened claim path (app_metadata → top-level; never user_metadata) | **A)** Leave in place (usually safe / preferred) **B)** Recreate prior definition from schema dump / `schema.sql` |
| `is_owner_portal_user()` | Dual-read app→user | Same as A/B |
| `current_owner_id()` / `current_owner_crm_id()` | Hardened | Same as A/B |
| `is_company_login()` | **New** for soft RLS | Leave inert **or** `drop function if exists public.is_company_login();` if no remaining dependents |
| `current_company_id()` | **New** | Leave inert **or** drop if unused |
| `company_matches(uuid)` | **New** | Leave inert **or** drop if unused |
| `can_access_company_row(uuid)` | **New** | Leave inert **or** drop if unused |
| `owner_company_aligned(uuid)` | **New** | Leave inert **or** drop if unused |

### 5.2 Recommended default (Path A and Path B)

1. **Restore policies first** (§3–§4).  
2. **Leave 006 V2 core helpers in place** if nothing references them in remaining policies — they are inert without company policies.  
3. Only drop new 006 V2 helpers after confirming no policy / view / trigger depends on them (§5.2 drop block below).

### 5.3 Do not

- Drop helpers while policies still call them (apply will fail mid-rollback).  
- Revert Package 1–5 schema (§1.3).  
- Change `companies` RLS.

### 5.4 Path B only — drop fix-migration helpers

After §3–§4 and §5.2, remove helpers introduced by `20260805120000_fix_with_check_helpers.sql`:

| Function | Fix migration role |
|----------|-------------------|
| `parent_owner_in_company(uuid, uuid)` | SECURITY DEFINER parent lookup for properties |
| `parent_property_in_company(uuid, uuid)` | units, meters |
| `parent_unit_in_company(uuid, uuid)` | contracts, maintenance |
| `parent_tenant_in_company(uuid, uuid)` | contracts |
| `parent_contract_in_company(uuid, uuid)` | invoices |
| `parent_invoice_in_company(uuid, uuid)` | payments |
| `secondary_units_same_company(uuid, jsonb)` | contracts secondary units (Production column type) |

```sql
-- Path B only. Run after §3 company policies are gone and §4 legacy SELECT restored.
-- Order: revoke grants, then drop (signature must match migration)

revoke execute on function public.parent_owner_in_company(uuid, uuid) from authenticated;
revoke execute on function public.parent_property_in_company(uuid, uuid) from authenticated;
revoke execute on function public.parent_unit_in_company(uuid, uuid) from authenticated;
revoke execute on function public.parent_tenant_in_company(uuid, uuid) from authenticated;
revoke execute on function public.parent_contract_in_company(uuid, uuid) from authenticated;
revoke execute on function public.parent_invoice_in_company(uuid, uuid) from authenticated;
revoke execute on function public.secondary_units_same_company(uuid, jsonb) from authenticated;

drop function if exists public.parent_owner_in_company(uuid, uuid);
drop function if exists public.parent_property_in_company(uuid, uuid);
drop function if exists public.parent_unit_in_company(uuid, uuid);
drop function if exists public.parent_tenant_in_company(uuid, uuid);
drop function if exists public.parent_contract_in_company(uuid, uuid);
drop function if exists public.parent_invoice_in_company(uuid, uuid);
drop function if exists public.secondary_units_same_company(uuid, jsonb);
drop function if exists public.secondary_units_same_company(uuid, uuid[]);
```

Optional — drop 006 V2 core helpers if confirmed unused (same as Path A):

```sql
drop function if exists public.owner_company_aligned(uuid);
drop function if exists public.can_access_company_row(uuid);
drop function if exists public.company_matches(uuid);
drop function if exists public.current_company_id();
drop function if exists public.is_company_login();
-- Prefer NOT dropping is_super_admin / is_owner_portal_user / current_owner_* unless replacing from §2.2 dump
```

**Path A:** Skip §5.4 entirely (`parent_*` never created).

---

## 6. Index drop (006b) — optional

006b creates indexes with `CREATE INDEX CONCURRENTLY`. Rollback is optional; indexes do not change isolation semantics. Independent of Path A vs B.

### 6.1 Drop statements (each outside an explicit transaction)

```sql
-- Run ONE AT A TIME. Do NOT wrap in BEGIN/COMMIT.
-- Optional: only if you want a clean clone or proved unused.

drop index concurrently if exists public.payments_company_alive_id_idx;
drop index concurrently if exists public.invoices_company_alive_id_idx;
drop index concurrently if exists public.invoices_company_alive_due_date_idx;
drop index concurrently if exists public.contracts_company_active_end_idx;
drop index concurrently if exists public.units_company_alive_status_idx;
drop index concurrently if exists public.maint_company_alive_id_idx;
drop index concurrently if exists public.properties_company_alive_name_idx;
drop index concurrently if exists public.properties_owner_crm_alive_idx;
drop index concurrently if exists public.payments_company_alive_payment_date_idx;
```

### 6.2 Do not drop

- Package 1–5 solo `*_company_id_idx` (or equivalent) indexes (§1.3).  
- Any unrelated prod indexes.

---

## 7. Post-rollback verification (read-only checks)

Run on the target and **record actual results** in §10 — do not copy example values into status reports.

```sql
-- 1) No soft-company policies remain
select count(*) as leftover_company_policies
from pg_policies
where schemaname = 'public'
  and (policyname like '%_company_%' or policyname = 'owners_owner_self_select');

-- 2) companies policies still present
select policyname from pg_policies
where schemaname = 'public' and tablename = 'companies'
order by policyname;

-- 3) company_id columns still present (Package 1–5 intact — §1.3)
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and column_name = 'company_id'
  and table_name in (
    'owners','tenants','properties','units','meters',
    'contracts','invoices','payments','maintenance_requests'
  )
order by table_name;

-- 4) Path B: fix helpers gone (skip on Path A)
select proname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'parent_owner_in_company',
    'parent_property_in_company',
    'parent_unit_in_company',
    'parent_tenant_in_company',
    'parent_contract_in_company',
    'parent_invoice_in_company',
    'secondary_units_same_company'
  );

-- 5) Optional: 006b indexes gone (only if §6 ran)
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in (
    'payments_company_alive_id_idx',
    'invoices_company_alive_id_idx',
    'invoices_company_alive_due_date_idx',
    'contracts_company_active_end_idx',
    'units_company_alive_status_idx',
    'maint_company_alive_id_idx',
    'properties_company_alive_name_idx',
    'properties_owner_crm_alive_idx',
    'payments_company_alive_payment_date_idx'
  );
```

App smoke (clone / local): ALODILA staff console + owner portal load without company-login claims.

---

## 8. Production gate reminder

| Action | Allowed without approval? |
|--------|---------------------------|
| Rehearse rollback on **local Docker** or **clone** | Yes |
| Apply or roll back 006 V2 / fix / 006b on **prod** `ryfqqyrqmsyngwcsfjug` | **No** — written approval required |
| Drop `company_id` columns as “rollback” | **Never** (§1.3) |

Production has **not** been modified by this migration pair as of the validation note at document top. Any prod apply or rollback requires explicit approval and real §7 / run-log evidence.

---

## 9. Quick reference — Path A vs Path B steps

| Step | Path A (006 V2 only) | Path B (+ fix migration) |
|------|----------------------|---------------------------|
| Pre-apply backup | §2.1 required | §2.1 required; §2.3 optional |
| Drop company policies | §3 | §3 |
| Restore legacy SELECT | §4 from §2.1 | §4 from §2.1 |
| Drop `parent_*` helpers | N/A | §5.4 |
| Drop 006 V2 core helpers | Optional §5.2 | Optional §5.2 after §5.4 |
| Drop 006b indexes | Optional §6 | Optional §6 |
| Verify | §7 | §7 (+ check 4 for helpers) |

---

## 10. Rollback run log template

```text
Date (UTC):
Operator:
Target: local Docker / clone ref ______ / PROD (if PROD, approval ticket: ______)
Rollback path: A (006 V2 only) / B (006 V2 + fix)
Pre-apply dump file (§2.1):
Optional pre-fix dump (§2.3): yes / no / N/A
006 V2 applied at:
Fix migration applied: yes / no / N/A
006b applied: yes / no
§3 company policy drops: done / skipped
§4 SELECT restore from dump: done / incomplete / N/A
§5.2 core helpers: left in place / dropped new only / fully reverted from dump
§5.4 parent_* helpers (Path B): done / N/A
§6 index drops: done / skipped
§7 leftover_company_policies count: ______ (record actual)
§7 company_id columns present: yes / no
§7 parent_* helpers remaining (Path B): ______ (record actual)
App smoke: PASS / FAIL / not run
Prod writes: NONE (required unless approved)
Notes (paste real errors / counts only — no fabricated PASS):
```

---

**Reminder:** This pack is documentation. Capturing dumps, dropping policies, restoring bodies, dropping helpers, and dropping indexes require explicit operator execution and **must never target production without approval**.
