import { isOwnerPortalUser, ownerCrmIdFromUser } from '../auth/roles.js'
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
 * Which company_id values this session may SELECT.
 * @param {{ user?: import('@supabase/supabase-js').User | null, resolution?: import('./types.js').CompanyResolution }} [opts]
 * @returns {Promise<import('./types.js').ReadScope>}
 */
export async function resolveReadScope(opts = {}) {
  const user = opts.user ?? (await requireUser())
  const resolution = opts.resolution ?? (await resolveCurrentCompany({ user }))

  // Transitional (Sprint 4 Stream C): production ops use role=super_admin without
  // assume-company. Soft-filter as ALODILA so staff lists keep working until
  // Sprint 5/7 claim cutover. Mirrors resolveWriteCompany transitional path.
  if (resolution.persona === 'platform_super_admin' && resolution.source === 'none') {
    return {
      mode: 'single',
      companyIds: [ALODILA_COMPANY_ID],
      ownerCrmId: null,
      allowUnscoped: false,
    }
  }

  if (!resolution.companyId) {
    return {
      mode: 'none',
      companyIds: [],
      ownerCrmId: null,
      allowUnscoped: false,
    }
  }

  if (isOwnerPortalUser(user) || resolution.persona === 'owner') {
    return {
      mode: 'owner_bounded',
      companyIds: [resolution.companyId],
      ownerCrmId: ownerCrmIdFromUser(user) || null,
      allowUnscoped: false,
    }
  }

  return {
    mode: 'single',
    companyIds: [resolution.companyId],
    ownerCrmId: null,
    allowUnscoped: false,
  }
}
