/**
 * PMS tenancy constants (data plane).
 * Duplicate of platform ALODILA UUID is intentional — do not import src/platform.
 */
export const ALODILA_COMPANY_ID = 'a1000000-a10d-4000-8000-000000000001'

/** Tables in soft-filter / stamp scope (Sprint 3 packages). */
export const TENANCY_SCOPED_TABLES = Object.freeze([
  'owners',
  'tenants',
  'properties',
  'units',
  'meters',
  'contracts',
  'invoices',
  'payments',
  'maintenance_requests',
])
