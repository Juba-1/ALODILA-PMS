-- rls-validation/sql/99_teardown.sql
-- Drop ONLY the validation database contents helpers.
-- The orchestrator drops the database itself from the maintenance DB.
-- This file is a no-op placeholder for in-DB cleanup if --keep-db is used later.

-- Optional: truncate harness results
-- truncate rls_val.results restart identity;

select 'teardown_in_db_noop' as status;
