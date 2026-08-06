import { supabase, hasSupabaseConfig } from '../supabase/client.js'
import { ALODILA_COMPANY_ID } from './constants.js'
import { resolveCurrentCompany } from './resolveCurrentCompany.js'
import { resolveReadScope } from './resolveReadScope.js'
import { resolveWriteCompany } from './resolveWriteCompany.js'
import { TenancyError, TENANCY_ERROR } from './errors.js'

/**
 * Apply company_id equality (or IN) for SELECT/list queries.
 * @template T
 * @param {T} query
 * @param {import('./types.js').ReadScope} scope
 * @returns {T}
 */
export function withCompanyEq(query, scope) {
  if (!scope || scope.allowUnscoped === true) {
    throw new TenancyError(
      TENANCY_ERROR.INVALID_SCOPE,
      'Invalid read scope: allowUnscoped is not permitted for PMS queries.',
    )
  }
  if (scope.mode === 'none' || !scope.companyIds?.length) {
    throw new TenancyError(
      TENANCY_ERROR.UNSCOPED_READ,
      'Unscoped PMS read refused (platform super admin without assume-company, or empty scope).',
    )
  }
  if (scope.companyIds.length === 1) {
    return query.eq('company_id', scope.companyIds[0])
  }
  return query.in('company_id', scope.companyIds)
}

/**
 * Apply company_id equality for UPDATE / soft-delete. Requires allowWrite.
 * @template T
 * @param {T} query
 * @param {import('./types.js').WriteCompany} write
 * @returns {T}
 */
export function withWriteCompanyEq(query, write) {
  if (!write?.allowWrite) {
    throw new TenancyError(
      TENANCY_ERROR.WRITE_DENIED,
      write?.reasonIfDenied || 'Write denied by tenancy adapter.',
    )
  }
  if (!write.companyId) {
    throw new TenancyError(TENANCY_ERROR.WRITE_DENIED, 'Cannot mutate: companyId is null.')
  }
  return query.eq('company_id', write.companyId)
}

/**
 * Stamp company_id onto an insert payload.
 * @param {Record<string, unknown>} payload
 * @param {import('./types.js').WriteCompany | string} writeOrCompanyId
 * @returns {Record<string, unknown>}
 */
export function stampInsert(payload, writeOrCompanyId) {
  const write =
    typeof writeOrCompanyId === 'string'
      ? { companyId: writeOrCompanyId, allowWrite: true, source: 'jwt_company_id', reasonIfDenied: null }
      : writeOrCompanyId

  if (!write?.allowWrite) {
    throw new TenancyError(
      TENANCY_ERROR.WRITE_DENIED,
      write?.reasonIfDenied || 'Write denied by tenancy adapter.',
    )
  }
  if (!write.companyId) {
    throw new TenancyError(TENANCY_ERROR.WRITE_DENIED, 'Cannot stamp insert: companyId is null.')
  }
  return { ...payload, company_id: write.companyId }
}

/**
 * Assert a loaded row belongs to the read scope.
 * @param {Record<string, unknown> | null | undefined} row
 * @param {import('./types.js').ReadScope} scope
 */
export function assertRowInScope(row, scope) {
  if (!row) {
    throw new TenancyError(TENANCY_ERROR.ROW_OUT_OF_SCOPE, 'Row not found or out of scope.')
  }
  if (scope.mode === 'none' || !scope.companyIds?.length) {
    throw new TenancyError(TENANCY_ERROR.UNSCOPED_READ, 'Cannot assert row against empty scope.')
  }
  const rowCompany = row.company_id == null ? null : String(row.company_id)
  if (!rowCompany || !scope.companyIds.includes(rowCompany)) {
    throw new TenancyError(
      TENANCY_ERROR.ROW_OUT_OF_SCOPE,
      'Row company_id is outside the session read scope.',
    )
  }
}

/**
 * Convenience: from(table).select(cols) + company eq (+ optional is_deleted).
 * @param {string} table
 * @param {string} columns
 * @param {import('./types.js').ReadScope} scope
 * @param {{ includeDeleted?: boolean }} [opts]
 */
export function scopedSelect(table, columns, scope, opts = {}) {
  if (!hasSupabaseConfig || !supabase) {
    throw new TenancyError(TENANCY_ERROR.NO_SESSION, 'Supabase is not configured.')
  }
  let q = supabase.from(table).select(columns)
  q = withCompanyEq(q, scope)
  if (!opts.includeDeleted) {
    q = q.eq('is_deleted', false)
  }
  return q
}

/**
 * Load parent row company_id and require it equals the write company (inheritance gate).
 * @param {string} table
 * @param {string} parentId
 * @param {string} writeCompanyId
 * @param {string} [label]
 */
export async function assertParentInWriteCompany(table, parentId, writeCompanyId, label = 'parent') {
  if (!hasSupabaseConfig || !supabase) {
    throw new TenancyError(TENANCY_ERROR.NO_SESSION, 'Supabase is not configured.')
  }
  if (!parentId) {
    throw new TenancyError(TENANCY_ERROR.ROW_OUT_OF_SCOPE, `${label} id is required.`)
  }
  const { data, error } = await supabase
    .from(table)
    .select('company_id')
    .eq('id', parentId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new TenancyError(TENANCY_ERROR.ROW_OUT_OF_SCOPE, `${label} not found.`)
  }
  if (String(data.company_id || '') !== String(writeCompanyId)) {
    throw new TenancyError(
      TENANCY_ERROR.ROW_OUT_OF_SCOPE,
      `${label} belongs to a different company.`,
    )
  }
}

/**
 * Façade used by db module wiring.
 * Does not replace the Supabase client.
 */
export const companyDb = {
  ALODILA_COMPANY_ID,
  resolveCurrentCompany,
  resolveReadScope,
  resolveWriteCompany,
  withCompanyEq,
  withWriteCompanyEq,
  stampInsert,
  assertRowInScope,
  assertParentInWriteCompany,
  scopedSelect,
}

export default companyDb
