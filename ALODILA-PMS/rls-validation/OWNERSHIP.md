# Ownership graph — RLS Validation Pipeline

```
Human (local postgres password owner)
  └── npm run rls:validate
        └── rls-validation/scripts/run.mjs          [Orchestrator]
              ├── detect.mjs                       [Env discovery / safety]
              ├── psql (local only)                [Execute SQL]
              ├── sql/00–02                        [Bootstrap]
              ├── supabase/migrations/005_*        [Packages 1–5 — read-only source]
              ├── supabase/migrations/006_*_v2     [Soft RLS under test]
              ├── sql/90_seed_synthetic.sql        [Deterministic tenants]
              ├── sql/91_jwt_simulator.sql         [GUC claim simulation]
              ├── sql/92_validation_suite.sql      [Assertions]
              └── reports/*                        [Artifacts]

Production Supabase (ryfqqyrqmsyngwcsfjug)
  └── OUT OF SCOPE — refused by host denylist
```

| Artifact | Owner |
|----------|-------|
| Soft RLS policy truth | `supabase/migrations/006_sprint4_soft_rls_v2.sql` |
| Harness bootstrap | `rls-validation/sql/*` |
| Capability limits | `rls-validation/CAPABILITY.md` |
| One-command entry | `package.json` → `rls:validate` |
