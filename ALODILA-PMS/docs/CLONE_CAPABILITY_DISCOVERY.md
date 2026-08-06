# Clone Capability Discovery (Verified)

**Date:** 2026-08-05  
**Mode:** Real capability verification — no clone created, Production not written

## Step-by-step verification

| # | Step | Autonomous? | Verified evidence |
|---|------|-------------|-------------------|
| 1 | Create new Supabase project | **GATED** | MCP `create_project` exists; org `taearmqsstquujfzzadb` known; `get_cost` = **$0/month**. Tool contract requires user org/cost confirmation via `confirm_cost` before create. |
| 2 | Provision true Clone | **NO today** | No clone project exists (only `ALODILA-PMS` + unrelated `streak up`). Branching unavailable (empty / permission error). |
| 3 | Export fresh Production dump | **NO now** | `pg_dump`/`psql` installed (PG 18.4). Local pooler auth **FAILED**: `EAUTHQUERY auth_query secret check timed out`. `supabase db dump --linked` **FAILED**: `LegacyProjectNotLinkedError`. MCP can `execute_sql` reads but cannot produce a full dump file. |
| 4 | Restore into Clone | **BLOCKED** | Depends on (1)+(3). Tools exist (`pg_restore`) once clone + dump exist. |
| 5 | Configure Clone env | **YES after clone** | Agent can write gitignored `.env.clone` locally. Must not touch Vercel Production. |
| 6 | Connect app to Clone | **YES after (5)** | Point Vite at `.env.clone` locally. |
| 7 | Verify Clone fidelity | **PARTIAL after restore** | MCP/`psql` count checks for `public` schema. Auth users usually need re-provision (not a clean dump of GoTrue). |

## Fully Autonomous end-to-end?

**NO**

## Exact blockers (minimum human actions)

See chat output Human Steps 1–3.

## Cost quote (verified)

Creating a **project** in org `Juba-1's Org` (`taearmqsstquujfzzadb`): **amount 0, recurrence monthly** (API `get_cost`).
