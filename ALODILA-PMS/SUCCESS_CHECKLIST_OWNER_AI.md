# Success Checklist — Owner Portal + Groq AI

Use this after applying SQL and env changes.

## A) Supabase — RLS helpers (JWT `user_metadata` + `app_metadata`)

1. Open **Supabase Dashboard → SQL Editor**.
2. Run the **two function definitions** at the top of `schema_owner_portal_rls.sql`:
   - `public.is_owner_portal_user()`
   - `public.current_owner_crm_id()`
3. If you never ran the full owner RLS file, run the **entire** `schema_owner_portal_rls.sql` once (policies + functions).
4. Confirm a test owner JWT contains **`user_metadata.role = "owner"`** and **`user_metadata.owner_crm_id`** (UUID string) matching `public.owners.id`.

## B) Data — `properties.owner_crm_id`

5. In **Table Editor → properties**, the owner’s buildings must have **`owner_crm_id`** = that same UUID (not only `owner_id` auth uid).

## C) Local env — Groq (chat + smart import)

6. File **`.env.local`** exists in the project root (copy from `.env.example` if needed).
7. Line present: **`VITE_GROQ_API_KEY=your_real_key`** (no quotes, no spaces around `=`).
8. **Stop and restart** `npm run dev` (Vite reads env only at startup).

## D) App verification

9. Log in as **owner** → **عقاراتي** should list properties (not zero) if (4)+(5) are correct.
10. Open the **floating AI** (✦) → you should get either a normal reply or a **clear Arabic toast** (missing key / network / safety), not a silent failure.
11. **Smart Import** → «تحليل بالذكاء الاصطناعي» should error with a clear message if the key is missing.

## E) If properties are still zero

- Re-check JWT in **Authentication → Users →** your user → **user_metadata** JSON.
- Re-run only the two `CREATE OR REPLACE FUNCTION` blocks from `schema_owner_portal_rls.sql`.
- Confirm RLS policy on `properties` includes the `is_owner_portal_user()` branch (see same SQL file).
