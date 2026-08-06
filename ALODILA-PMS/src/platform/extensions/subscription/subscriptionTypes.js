/** Subscription summary shape — parallel domain keyed by companyId. */

export const SUBSCRIPTION_STATUSES = /** @type {const} */ ([
  'not_configured',
  'trialing',
  'active',
  'past_due',
  'canceled',
])
