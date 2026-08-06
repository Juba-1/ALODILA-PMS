import {
  isCompanyOperatorUser,
  isOwnerPortalUser,
  isSuperAdminUser,
} from '../auth/roles.js'

export const PLATFORM_HOME = '/platform'
export const COMPANY_HOME = '/company'
export const OWNER_HOME = '/owner'

/** Build a Company Portal path under `/company`. */
export function companyPath(subpath = '') {
  const s = String(subpath || '').replace(/^\/+/, '')
  return s ? `${COMPANY_HOME}/${s}` : COMPANY_HOME
}

/** Post-login / product home from Supabase session user (app_metadata only). */
export function homePathForUser(user) {
  if (isSuperAdminUser(user)) return PLATFORM_HOME
  if (isOwnerPortalUser(user)) return OWNER_HOME
  if (isCompanyOperatorUser(user)) return COMPANY_HOME
  return '/'
}

/**
 * Which product tree the authenticated user belongs to.
 * @returns {'platform' | 'owner' | 'company' | 'none'}
 */
export function productForUser(user) {
  if (isSuperAdminUser(user)) return 'platform'
  if (isOwnerPortalUser(user)) return 'owner'
  if (isCompanyOperatorUser(user)) return 'company'
  return 'none'
}
