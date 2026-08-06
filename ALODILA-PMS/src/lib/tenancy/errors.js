/**
 * Tenancy errors — thrown by resolvers / companyDb helpers.
 * Not wired into UI yet (Stream A = adapter only).
 */
export class TenancyError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'TenancyError'
    this.code = code
  }
}

export const TENANCY_ERROR = Object.freeze({
  NO_SESSION: 'TENANCY_NO_SESSION',
  UNSCOPED_READ: 'TENANCY_UNSCOPED_READ',
  WRITE_DENIED: 'TENANCY_WRITE_DENIED',
  ROW_OUT_OF_SCOPE: 'TENANCY_ROW_OUT_OF_SCOPE',
  INVALID_SCOPE: 'TENANCY_INVALID_SCOPE',
})
