# Release tooling — Soft RLS Gate A

Scripts in this folder gate **clone-first** apply of Soft RLS migrations. They never connect to Production.

**Production project ref (blocked):** `ryfqqyrqmsyngwcsfjug`

## Manifest

`REQUIRED_ARTIFACTS.json` lists migration paths, quarantine files, and release docs checked by preflight.

## Preflight

Verifies the canonical migration pair exists, quarantine artifacts are present, and release docs exist (docs warn-only if still being authored).

```bash
# Future one-command (parent wires package.json):
npm run release:preflight

# Direct:
node rls-validation/scripts/release-preflight.mjs
```

**Exit codes**

| Code | Meaning |
|------|---------|
| 0 | Migration pair present; safe to proceed on clone |
| 2 | Required migration file(s) missing |
| 3 | Environment variable points at Production host |

**Ordered apply (clone / Gate A)**

1. `supabase/migrations/006_sprint4_soft_rls_v2.sql`
2. `supabase/migrations/20260805120000_fix_with_check_helpers.sql`

Do **not** apply quarantined V1 / 007 / 006b via `supabase db reset` — see `supabase/quarantine/README.md`.

## Clone smoke

Runs API-level RLS checks against a Supabase project using real JWT + PostgREST.

```bash
# Local full suite (same as rls-validation seed users):
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY=<local anon key>
npm run release:smoke
# or: node rls-validation/scripts/clone-smoke.mjs

# Clone / staging (explicit opt-in):
export SUPABASE_URL=https://<clone-ref>.supabase.co
export SUPABASE_ANON_KEY=<clone anon key>
export ALLOW_CLONE_SMOKE=YES
node rls-validation/scripts/clone-smoke.mjs
```

**Exit codes**

| Code | Meaning |
|------|---------|
| 0 | All smoke tests passed |
| 2 | Missing `SUPABASE_URL` / `SUPABASE_ANON_KEY` |
| 3 | Production host refused |
| 4 | Non-local URL without `ALLOW_CLONE_SMOKE=YES` |
| 5 | Auth sign-in failed — **Auth bind required** on clone |
| 6 | Unexpected suite error |
| 7 | One or more tests failed |

Reports are written under `rls-validation/reports/` (`clone-smoke-*.md` on clone; local full suite uses `local-api-validation-*.md`).

### Auth / seed users

| Context | Users | Password |
|---------|-------|----------|
| **Local** (`npm run rls:validate` / localhost smoke) | `staff-a@local.alodila.test`, etc. | `Password123!` (seed only) |
| **Clone** | Must be provisioned with real Auth + `app_metadata` company bindings | Not `Password123!` |

If clone smoke exits **5**, provision users per `docs/AUTH_RELEASE_MIGRATION_KIT.md` before re-running.

## Refusal rules (summary)

| Check | Preflight | Clone smoke |
|-------|-----------|-------------|
| Production host in env / URL | Refuse (exit 3) | Refuse (exit 3) |
| Missing migration pair | Refuse (exit 2) | — |
| Missing docs | Warn only | — |
| Non-localhost URL | — | Requires `ALLOW_CLONE_SMOKE=YES` |
| Auth sign-in failure on clone | — | Exit 5 + Auth bind message |

## Typical release sequence

1. `node rls-validation/scripts/release-preflight.mjs`
2. Apply migrations **on clone only** in listed order
3. Set clone `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `ALLOW_CLONE_SMOKE=YES`
4. `node rls-validation/scripts/clone-smoke.mjs`
5. Follow `docs/GATE_A_EXECUTION_CHECKLIST.md` and `docs/PRODUCTION_SOFT_RLS_RUNBOOK.md` for production promotion (human approval).
