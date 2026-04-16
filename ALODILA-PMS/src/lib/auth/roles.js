/**
 * Role detection from Supabase session (app_metadata or user_metadata).
 * Owner portal: app_metadata from Dashboard, or user_metadata from first signUp (Phase 11 onboarding).
 *   { "role": "owner", "owner_crm_id": "<uuid of public.owners.id>" }
 */

export function appRole(user) {
  if (!user) return ''
  const m = user.app_metadata || {}
  const u = user.user_metadata || {}
  return String(m.role || u.role || '')
}

export function ownerCrmIdFromUser(user) {
  if (!user) return ''
  const m = user.app_metadata || {}
  const u = user.user_metadata || {}
  const id = m.owner_crm_id ?? u.owner_crm_id
  if (id == null || id === '') return ''
  return String(id).trim()
}

export function isOwnerPortalUser(user) {
  return appRole(user) === 'owner' && ownerCrmIdFromUser(user).length > 0
}

export function isSuperAdminUser(user) {
  return appRole(user) === 'super_admin'
}

/** For AI chat system prompts: super_admin | owner | staff */
export function chatUserRole(user) {
  if (!user) return 'staff'
  if (isSuperAdminUser(user)) return 'super_admin'
  if (isOwnerPortalUser(user)) return 'owner'
  return 'staff'
}
