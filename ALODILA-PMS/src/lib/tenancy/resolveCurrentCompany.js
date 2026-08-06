import {
  isOwnerPortalUser,
  isSuperAdminUser,
  ownerCrmIdFromUser,
} from '../auth/roles.js'
import { supabase, hasSupabaseConfig } from '../supabase/client.js'
import { ALODILA_COMPANY_ID } from './constants.js'
import { getAssumeCompanyId } from './assumeCompanyContext.js'
import { TenancyError, TENANCY_ERROR } from './errors.js'

/**
 * Trusted company_id from app_metadata only (006 V2 / JWT claim model).
 * Never read user_metadata.company_id (client-spoofable).
 * @param {import('@supabase/supabase-js').User | null | undefined} user
 * @returns {string}
 */
export function companyIdFromUser(user) {
  if (!user) return ''
  const id = (user.app_metadata || {}).company_id
  if (id == null || id === '') return ''
  return String(id).trim()
}

/**
 * @param {import('@supabase/supabase-js').User | null | undefined} user
 * @returns {boolean}
 */
export function isCompanyLoginUser(user) {
  const role = String((user?.app_metadata || {}).role || '')
  return (
    (role === 'company' || role === 'company_admin' || role === 'company_staff') &&
    companyIdFromUser(user).length > 0
  )
}

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
 * Transition helper: load owners.company_id for portal users missing JWT company_id.
 * @param {string} ownerCrmId
 * @returns {Promise<string | null>}
 */
async function companyIdFromOwnerRow(ownerCrmId) {
  if (!supabase || !ownerCrmId) return null
  const { data, error } = await supabase
    .from('owners')
    .select('company_id')
    .eq('id', ownerCrmId)
    .maybeSingle()
  if (error || !data?.company_id) return null
  return String(data.company_id).trim() || null
}

/**
 * Resolve which company this session is operating as.
 * @param {{ user?: import('@supabase/supabase-js').User | null }} [opts]
 * @returns {Promise<import('./types.js').CompanyResolution>}
 */
export async function resolveCurrentCompany(opts = {}) {
  const user = opts.user ?? (await requireUser())

  if (isOwnerPortalUser(user)) {
    const claimed = companyIdFromUser(user)
    if (claimed) {
      return {
        companyId: claimed,
        source: 'jwt_owner_company_id',
        persona: 'owner',
        isDefaulted: false,
      }
    }
    const fromRow = await companyIdFromOwnerRow(ownerCrmIdFromUser(user))
    if (fromRow) {
      return {
        companyId: fromRow,
        source: 'jwt_owner_company_id',
        persona: 'owner',
        isDefaulted: false,
      }
    }
    return {
      companyId: ALODILA_COMPANY_ID,
      source: 'legacy_default_alodila',
      persona: 'owner',
      isDefaulted: true,
    }
  }

  if (isCompanyLoginUser(user)) {
    return {
      companyId: companyIdFromUser(user),
      source: 'jwt_company_id',
      persona: 'company',
      isDefaulted: false,
    }
  }

  if (isSuperAdminUser(user)) {
    const assumed = getAssumeCompanyId()
    if (assumed) {
      return {
        companyId: assumed,
        source: 'assume_company',
        persona: 'platform_super_admin',
        isDefaulted: false,
      }
    }
    return {
      companyId: null,
      source: 'none',
      persona: 'platform_super_admin',
      isDefaulted: false,
    }
  }

  // Staff / legacy operator (no company claim yet) → ALODILA
  return {
    companyId: ALODILA_COMPANY_ID,
    source: 'legacy_default_alodila',
    persona: 'staff_legacy',
    isDefaulted: true,
  }
}
