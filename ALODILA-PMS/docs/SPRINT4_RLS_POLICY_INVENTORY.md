# Sprint 4 — Live RLS Policy Inventory

**Product:** ALODILA-PMS  
**Source:** Production `ryfqqyrqmsyngwcsfjug` via read-only `pg_policies` (2026-08-04)  
**Status:** Inventory only — no policy changes applied  
**Companion:** `006_sprint4_soft_rls_v2.sql` must match these **exact** live names

---

## 0. Scope

### In-scope PMS tables (soft tenancy)

`owners` · `tenants` · `properties` · `units` · `meters` · `contracts` · `invoices` · `payments` · `maintenance_requests` · `companies`

### Out-of-scope contaminant / foreign schema (DO NOT TOUCH in Sprint 4)

| Table | Policies | Notes |
|-------|----------|-------|
| `organizations`, `profiles`, `projects`, `project_organizations`, `project_user_assignments`, `roles` | `simp_private.*` | Leftover non-PMS product surface on same DB — **quarantine**; never soft-company them |

---

## 1. Complete PMS policy inventory

| Table | Policy | Cmd | Predicate summary | Preserve? | 006 V2 action |
|-------|--------|-----|-------------------|-----------|---------------|
| **companies** | `companies_select_policy` | SELECT | `is_super_admin()` | **YES** | No change |
| companies | `companies_insert_policy` | INSERT | SA + `is_deleted=false` | **YES** | No change |
| companies | `companies_update_policy` | UPDATE | SA | **YES** | No change |
| **owners** | `owners_super_admin_policy` | ALL | `is_super_admin()` | **YES** | Keep; add company/owner-self policies |
| **tenants** | `tenants_select_policy` | SELECT | SA OR `owner_id=auth.uid` graph OR owner portal `owner_crm_id` | Rewrite | Drop+recreate with company align; **drop bare auth.uid OR require company_matches** |
| tenants | `tenants_insert_policy` | INSERT | SA only | **YES** | Keep; add `tenants_company_insert` |
| tenants | `tenants_update_policy` | UPDATE | SA only | **YES** | Keep; add `tenants_company_update` |
| **properties** | `owner_view_own_properties` | SELECT | SA OR `owner_crm_id = current_owner_id()` (**no is_deleted**) | Rewrite | Drop+recreate; add company align + is_deleted; **no** competing `properties_select_policy` on live |
| properties | `properties_insert_policy` | INSERT | SA | **YES** | Keep + company insert |
| properties | `properties_update_policy` | UPDATE | SA | **YES** | Keep + company update |
| **units** | `owner_view_own_units` | SELECT | SA OR EXISTS property.owner_crm_id | Rewrite | Drop+recreate + company align |
| units | `units_select_policy` | SELECT | SA OR `owner_id=auth.uid` | **CONFLICT** | Drop+recreate: merge or require `company_matches` on auth.uid path |
| units | `units_insert_policy` | INSERT | SA | **YES** | Keep + company |
| units | `units_update_policy` | UPDATE | SA | **YES** | Keep + company |
| **meters** | `meters_select_policy` | SELECT | SA OR auth.uid (**no owner portal on live**) | Rewrite | Add owner portal + company; tighten auth.uid |
| meters | `meters_insert/update_policy` | I/U | SA | **YES** | Keep + company |
| **contracts** | `contracts_select_policy` | SELECT | SA OR auth.uid OR owner portal | Rewrite | + `owner_company_aligned` + company_matches on auth.uid |
| contracts | `contracts_insert/update_policy` | I/U | SA | **YES** | Keep + company |
| **invoices** | `invoices_select_policy` | SELECT | SA OR auth.uid OR owner | Rewrite | Same pattern |
| invoices | `invoices_insert/update_policy` | I/U | SA | **YES** | Keep + company |
| **payments** | `payments_select_policy` | SELECT | SA OR auth.uid OR owner | Rewrite | Same pattern |
| payments | `payments_insert/update_policy` | I/U | SA | **YES** | Keep + company |
| **maintenance** | `maintenance_select_policy` | SELECT | SA OR auth.uid OR owner | Rewrite | Same pattern |
| maintenance | `maintenance_insert/update_policy` | I/U | SA | **YES** | Keep + company |

### Names NOT present on live (repo-only drift)

| Name in repo schemas | Live? |
|----------------------|-------|
| `properties_select_policy` | **NO** — live uses `owner_view_own_properties` only |
| Owner portal meters branch | **Missing** on live `meters_select_policy` |

006 V2 must `DROP IF EXISTS` both live and repo names to prevent additive OR conflicts after restore from mixed sources.

---

## 2. Duplicate / overlapping analysis

| Issue | Tables | Risk | Resolution in V2 |
|-------|--------|------|------------------|
| Dual SELECT on units | `owner_view_own_units` + `units_select_policy` | Redundant SA; auth.uid vs owner_crm split | Keep both names but both require company soft rules |
| Permissive OR | All SELECT | Intentional layers OR | Company path = new policy; tighten legacy paths in place |
| No `properties_select_policy` | properties | V1 006 assumed wrong name | Inventory-driven drops |
| Contaminant ORMs | organizations… | Cross-product confusion | Explicit out-of-scope |

---

## 3. Dependency graph

```
JWT claims (request.jwt.claims)
    ├── is_super_admin() ──────────► companies.* , *_insert/update (SA), owners ALL
    ├── is_owner_portal_user()
    │       └── current_owner_id() ─► owner SELECT branches (properties.owner_crm_id → units/meters/…)
    └── current_company_id()  [NEW V2]
            ├── company_matches(row)
            ├── is_company_login() ─► company_* SELECT/INSERT/UPDATE
            └── owner_company_aligned(row)

Graph SELECT (legacy):
  payments → invoices → contracts → units → properties.owner_id|owner_crm_id
  maintenance → units → properties
  tenants → contracts → units → properties
  meters → properties

Denormalized path (preferred ops):
  row.company_id ← company_matches / stampInsert
```

---

## 4. Preserve vs remove

| Preserve forever (Sprint 4) | Remove / replace |
|-----------------------------|------------------|
| All `companies_*` policies | Nothing on companies |
| `owners_super_admin_policy` | — |
| SA-only `*_insert_policy` / `*_update_policy` names (bodies stay SA) | — |
| Soft-delete (no DELETE policies) | — |
| Contaminant policies | Untouched (quarantine) |

| Rewrite bodies | Add new |
|----------------|---------|
| All PMS SELECT policies that include owner or auth.uid | `*_company_select/insert/update` |
| Live properties/units owner_view_* | `owners_company_*`, `owners_owner_self_select` |

---

## 5. Architectural challenge (inventory)

**Better than additive-only OR:** One SELECT policy per table with explicit layers (SA | company_matches | owner+aligned) reduces planner OR fan-out and name drift. V2 still uses additive company_* writes (keeps SA insert/update names intact) but **rewrites SELECT bodies in place** using inventory names so owner alignment cannot be bypassed by a leftover permissive twin.

---

*End of inventory*
