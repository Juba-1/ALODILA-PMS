/**
 * Role detection from Supabase session.
 * Authz (aligned with 006 V2 / JWT claim model): app_metadata ONLY.
 * Client-writable user_metadata is never used for authorization.
 * Platform Admin: `super_admin` (live) or `platform_super_admin` (target).
 * Owner / company actors must be provisioned via Dashboard or service role.
 */

export function appRole(user) {
  if (!user) return ''
  return String((user.app_metadata || {}).role || '').trim()
}

export function ownerCrmIdFromUser(user) {
  if (!user) return ''
  const id = (user.app_metadata || {}).owner_crm_id
  if (id == null || id === '') return ''
  return String(id).trim()
}

export function isOwnerPortalUser(user) {
  return appRole(user) === 'owner' && ownerCrmIdFromUser(user).length > 0
}

export function isSuperAdminUser(user) {
  const role = appRole(user)
  return role === 'super_admin' || role === 'platform_super_admin'
}

/** Company operator — matches SQL is_company_login() (app_metadata only). */
export function isCompanyOperatorUser(user) {
  if (!user) return false
  const role = appRole(user)
  const companyId = String((user.app_metadata || {}).company_id || '').trim()
  return (
    (role === 'company' || role === 'company_admin' || role === 'company_staff') &&
    companyId.length > 0
  )
}

/** @deprecated Prefer isCompanyOperatorUser — kept as alias for call sites. */
export function isCompanyLoginUser(user) {
  return isCompanyOperatorUser(user)
}

/** For AI chat system prompts: super_admin | owner | staff */
export function chatUserRole(user) {
  if (!user) return 'staff'
  if (isSuperAdminUser(user)) return 'super_admin'
  if (isOwnerPortalUser(user)) return 'owner'
  return 'staff'
}
