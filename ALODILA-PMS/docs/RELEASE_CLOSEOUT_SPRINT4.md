# Sprint 4 Soft RLS — Repository Release Closeout

**Date:** 2026-08-05  
**Status:** REPOSITORY ENGINEERING COMPLETE for Gate A preparation  
**Production:** UNTOUCHED (`ryfqqyrqmsyngwcsfjug`)  
**Final local proof:** `npm run local:validate` → **22/22 PASS** (2026-08-05T13:08Z)  
**Final closeout:** `npm run release:closeout` → preflight PASS + smoke **22/22 PASS**

---

## What is complete inside the repository

| Area | Status |
|------|--------|
| App tenancy (Streams A/B/C) | COMPLETE |
| Soft RLS SQL pair (006 V2 + fix helpers) | AUTHORED + locally validated |
| Quarantine (V1 / 007 / 006b) | In place; preflight blocks leaks into migrations |
| Local Docker platform + seed | COMPLETE |
| Local API isolation | 22/22 PASS |
| Auth migration kit (dry-run promote, inventory SQL) | COMPLETE — refuses Production; Admin HTTP (no supabase-js) |
| Release preflight / clone smoke / closeout | COMPLETE |
| Production Soft RLS runbook | COMPLETE |
| Gate A checklist | COMPLETE |
| Rollback Path A/B | COMPLETE |
| Authz path | `app_metadata` only in `roles.js` / tenancy resolvers / SQL helpers |

## Known Soft-RLS transitional behaviors (NOT defects for this release)

- Platform SA without assume-company still stamps/filters ALODILA in **app** layer until Gate C — expected Soft design; never use SA for isolation PASS.
- Company SELECT can see soft-deleted rows (Postgres UPDATE/SELECT coupling); **app** lists filter `is_deleted=false`.
- Owner signup still writes `user_metadata` in the client; **Gate A Auth promote** must lift claims to `app_metadata` before Soft RLS on shared environments.

## Commands (repo)

```bash
npm run release:preflight   # artifact + migration collision gate
npm run release:closeout    # preflight + smoke (auto-detects local stack)
npm run local:validate      # Docker reset + API suite
npm run release:smoke       # local or ALLOW_CLONE_SMOKE=YES
npm run auth:promote:dry -- --users rls-validation/release/users.promote.example.json
# local seeded dry-run:
#   --users rls-validation/release/users.promote.local.seed.json
```

## What remains (EXTERNAL ONLY)

1. Create / restore non-prod **clone** (infra + cost + approval)
2. Service-role secret on clone → Auth promote (`AUTH_RELEASE_MIGRATION_KIT.md`)
3. Apply `006` → `20260805120000_fix_…` on clone
4. Isolation QA (company/owner, never SA)
5. Written approval → Production same pair

---

**Closeout statement:** Everything remaining is operational. No further repository engineering is required.
