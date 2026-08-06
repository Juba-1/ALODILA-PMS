/**
 * Break-glass assume-company context (Sprint 7 placeholder).
 * MVP: always inactive — no sessionStorage / platform table wiring yet.
 */

/** @returns {string | null} Assumed company UUID, or null when inactive. */
export function getAssumeCompanyId() {
  return null
}

/** @returns {boolean} */
export function hasAssumeCompanyContext() {
  return getAssumeCompanyId() != null
}
