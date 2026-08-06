/** Platform constants — read-side only (Phase 2A). */

export const ALODILA_COMPANY_ID = 'a1000000-a10d-4000-8000-000000000001'
export const ALODILA_COMPANY_SLUG = 'alodila'

/** @typedef {'active' | 'suspended' | 'provisioning'} CompanyStatus */

export const COMPANY_STATUSES = /** @type {const} */ (['active', 'suspended', 'provisioning'])

export const COMPANY_SELECT_COLUMNS =
  'id,created_at,updated_at,is_deleted,name,slug,status,auth_user_id,notes'
