/**
 * Shared tenancy adapter (Sprint 4).
 * Stream A: resolvers + companyDb helpers.
 * Stream B: INSERT stamps (stampInsert / resolveWriteCompany).
 * Stream C: SELECT filters (withCompanyEq / resolveReadScope).
 * Stream D (app): UPDATE / soft-delete via withWriteCompanyEq.
 * Soft RLS SQL: supabase/migrations/006_sprint4_soft_rls_v2.sql (+ fix helpers) — LIVE on Production.
 * V1 006_sprint4_soft_rls_and_indexes.sql is SUPERSEDED.
 * Platform Admin (src/platform/**) must NOT import this module for companies registry.
 */

export { ALODILA_COMPANY_ID, TENANCY_SCOPED_TABLES } from './constants.js'
export { TenancyError, TENANCY_ERROR } from './errors.js'
export { getAssumeCompanyId, hasAssumeCompanyContext } from './assumeCompanyContext.js'
export {
  resolveCurrentCompany,
  companyIdFromUser,
  isCompanyLoginUser,
} from './resolveCurrentCompany.js'
export { resolveReadScope } from './resolveReadScope.js'
export { resolveWriteCompany } from './resolveWriteCompany.js'
export {
  companyDb,
  withCompanyEq,
  withWriteCompanyEq,
  stampInsert,
  assertRowInScope,
  assertParentInWriteCompany,
  scopedSelect,
} from './companyDb.js'
