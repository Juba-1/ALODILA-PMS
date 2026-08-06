import { isOwnerPortalUser } from '../auth/roles.js'
import { resolveCurrentCompany } from './resolveCurrentCompany.js'
import { supabase, hasSupabaseConfig } from '../supabase/client.js'
import { ALODILA_COMPANY_ID } from './constants.js'
import { TenancyError, TENANCY_ERROR } from './errors.js'

/**
 * @returns {Promise<import('@supabase/supabase-js').User>}
 */
async function requireUser() {
  if (!hasSupabaseConfig || !supabase) {
    throw new TenancyError(TENANCY_ERROR.NO_SESSION, 'Supabase is not configured.')
  }
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    throw new TenancyError(TENANCY_ERROR.NO_SESSION, 'No authenticated session.')
  }
  return data.user
}

/**
 * Which company_id must be stamped on INSERT / verified on UPDATE.
 * @param {{ user?: import('@supabase/supabase-js').User | null, resolution?: import('./types.js').CompanyResolution, allowOwnerWrite?: boolean }} [opts]
 * @returns {Promise<import('./types.js').WriteCompany>}
 */
export async function resolveWriteCompany(opts = {}) {
  const user = opts.user ?? (await requireUser())
  const resolution = opts.resolution ?? (await resolveCurrentCompany({ user }))
  const allowOwnerWrite = opts.allowOwnerWrite === true

  // Transitional (Sprint 4 Stream B): production ALODILA ops still use role=super_admin
  // without assume-company. Stamp as ALODILA so creates keep working until Sprint 5/7
  // claim cutover + audited assume-company. Read scope may still be mode "none".
  if (resolution.persona === 'platform_super_admin' && resolution.source === 'none') {
    return {
      companyId: ALODILA_COMPANY_ID,
      source: 'legacy_default_alodila',
      allowWrite: true,
      reasonIfDenied: null,
    }
  }

  if (resolution.persona === 'owner' || isOwnerPortalUser(user)) {
    if (!allowOwnerWrite) {
      return {
        companyId: resolution.companyId,
        source: resolution.source,
        allowWrite: false,
        reasonIfDenied: 'Owner portal is read-only for PMS ops writes.',
      }
    }
    if (!resolution.companyId) {
      return {
        companyId: null,
        source: resolution.source,
        allowWrite: false,
        reasonIfDenied: 'Owner session has no resolvable company_id.',
      }
    }
    return {
      companyId: resolution.companyId,
      source: resolution.source,
      allowWrite: true,
      reasonIfDenied: null,
    }
  }

  if (!resolution.companyId) {
    return {
      companyId: null,
      source: resolution.source,
      allowWrite: false,
      reasonIfDenied: 'No company_id resolved for write stamp.',
    }
  }

  // company login, staff_legacy, or super_admin with assume-company
  return {
    companyId: resolution.companyId,
    source: resolution.source,
    allowWrite: true,
    reasonIfDenied: null,
  }
}
