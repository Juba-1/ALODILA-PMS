# RLS Validation Pipeline — ALODILA-PMS

**Purpose:** Permanent, one-command local validation of soft RLS (`006_sprint4_soft_rls_v2.sql`).  
**Production:** Never connected. Never modified.

## One command

```bash
npm run rls:validate
```

Equivalent:

```bash
node rls-validation/scripts/run.mjs
```

## Pipeline stages (strict)

```
DETECT → VERIFY → BUILD → SEED → EXECUTE → REPORT → CLEANUP
```

Any stage failure **STOPS** the pipeline. No fabricated results.

## Prerequisites (human)

1. Local PostgreSQL running (this machine: `postgresql-x64-18`).
2. Credentials in `rls-validation/.env.local` (copy from `.env.example`).
3. **Do not** put Production Supabase passwords in this file.

## Layout

| Path | Role |
|------|------|
| `scripts/run.mjs` | Orchestrator (one entry) |
| `scripts/detect.mjs` | Environment discovery |
| `sql/00_*` … `99_*` | Bootstrap → seed → suite → teardown |
| `sql/migrations/` | Ordered copies / pointers applied locally |
| `reports/` | Generated JSON + Markdown reports |
| `CAPABILITY.md` | What this harness can / cannot prove |

## Flags

| Flag | Meaning |
|------|---------|
| `--keep-db` | Skip teardown (inspect manually) |
| `--detect-only` | Stop after DETECT/VERIFY |
| `--no-report` | Skip writing report files |

## Safety

- Database name is always `alodila_rls_validation` (configurable only via env, never prod refs).
- Refuses hosts matching `supabase.co` / known prod pooler names.
- Teardown drops **only** the validation database.
