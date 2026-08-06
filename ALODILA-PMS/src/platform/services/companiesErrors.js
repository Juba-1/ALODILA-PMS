import { ProtectedCompanyError } from '../lib/protectedCompanies.js'
import { InvalidTransitionError } from '../lib/companyTransitions.js'

export class PlatformCompanyError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   * @param {{ fields?: Record<string, string> }} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message || code)
    this.name = 'PlatformCompanyError'
    this.code = code
    this.fields = extra.fields || null
  }
}

export function validationError(fields) {
  return new PlatformCompanyError('VALIDATION', 'VALIDATION', { fields })
}

/**
 * Map thrown values / PostgREST errors to PlatformCompanyError.
 */
export function mapCompanyError(err) {
  if (err instanceof PlatformCompanyError) return err
  if (err instanceof ProtectedCompanyError) {
    return new PlatformCompanyError('PROTECTED_COMPANY', err.message)
  }
  if (err instanceof InvalidTransitionError) {
    return new PlatformCompanyError('INVALID_TRANSITION', err.message)
  }

  const code = err?.code
  const msg = String(err?.message || '')
  const details = String(err?.details || '')
  const combined = `${msg} ${details}`.toLowerCase()

  if (code === '23505' || combined.includes('companies_slug_key') || combined.includes('duplicate key')) {
    return new PlatformCompanyError('SLUG_TAKEN', msg)
  }
  if (code === '23514' || combined.includes('check constraint')) {
    return new PlatformCompanyError('CHECK_VIOLATION', msg)
  }
  if (code === '42501' || /permission|rls|not authorized|jwt/i.test(msg)) {
    return new PlatformCompanyError('UNAUTHORIZED', msg)
  }
  if (err?.name === 'AbortError' || /abort|network|failed to fetch/i.test(msg)) {
    return new PlatformCompanyError('NETWORK', msg)
  }

  if (err?.code === 'AUTH_ADMIN' || err?.status === 400 || err?.status === 500) {
    return new PlatformCompanyError('AUTH_ADMIN', msg)
  }

  return new PlatformCompanyError('UNKNOWN', msg || 'UNKNOWN')
}

/** i18n key for a platform error code / field code */
export function errorMessageKey(code) {
  const map = {
    VALIDATION: 'platform.errors.validation',
    PROTECTED_COMPANY: 'platform.errors.protectedCompany',
    INVALID_TRANSITION: 'platform.errors.invalidTransition',
    SLUG_TAKEN: 'platform.errors.slugTaken',
    CHECK_VIOLATION: 'platform.errors.checkViolation',
    UNAUTHORIZED: 'platform.errors.unauthorized',
    NOT_FOUND: 'platform.errors.notFound',
    NETWORK: 'platform.errors.network',
    UNKNOWN: 'platform.errors.unknown',
    nameRequired: 'platform.errors.nameRequired',
    nameTooLong: 'platform.errors.nameTooLong',
    slugRequired: 'platform.errors.slugRequired',
    slugInvalid: 'platform.errors.slugInvalid',
    slugTooLong: 'platform.errors.slugTooLong',
    statusInvalid: 'platform.errors.statusInvalid',
    notesTooLong: 'platform.errors.notesTooLong',
    planRequired: 'platform.errors.planRequired',
    planInvalid: 'platform.errors.planInvalid',
    emailRequired: 'platform.errors.emailRequired',
    emailInvalid: 'platform.errors.emailInvalid',
    passwordRequired: 'platform.errors.passwordRequired',
    passwordTooShort: 'platform.errors.passwordTooShort',
    passwordMismatch: 'platform.errors.passwordMismatch',
    AUTH_ADMIN: 'platform.errors.authAdmin',
  }
  return map[code] || 'platform.errors.unknown'
}
