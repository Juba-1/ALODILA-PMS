/**
 * Subscription seam — CRUD must not depend on billing.
 * Read-only placeholder until a billing sprint.
 * @param {string} companyId
 */
export function getSubscriptionSummary(companyId) {
  return {
    companyId: String(companyId || ''),
    planCode: 'none',
    planLabel: '—',
    status: 'not_configured',
    renewsAt: null,
    limits: {
      maxUsers: null,
      maxProperties: null,
      maxUnits: null,
    },
    billing: {
      provider: null,
      customerId: null,
      nextInvoiceAt: null,
    },
  }
}
