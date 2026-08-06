import { ALODILA_COMPANY_ID, ALODILA_COMPANY_SLUG } from './constants.js'

export function isProtectedCompany(companyOrIdOrSlug) {
  if (companyOrIdOrSlug == null) return false
  if (typeof companyOrIdOrSlug === 'string') {
    const v = companyOrIdOrSlug.trim()
    return v === ALODILA_COMPANY_ID || v === ALODILA_COMPANY_SLUG
  }
  const id = String(companyOrIdOrSlug.id || '').trim()
  const slug = String(companyOrIdOrSlug.slug || '').trim()
  return id === ALODILA_COMPANY_ID || slug === ALODILA_COMPANY_SLUG
}

export function lockedFieldsFor(company) {
  if (!isProtectedCompany(company)) {
    return { name: false, slug: false, status: false, softDelete: false, id: true }
  }
  return { name: true, slug: true, status: true, softDelete: true, id: true }
}

export class ProtectedCompanyError extends Error {
  constructor(message = 'PROTECTED_COMPANY') {
    super(message)
    this.name = 'ProtectedCompanyError'
    this.code = 'PROTECTED_COMPANY'
  }
}

export function assertCanUpdateIdentity(company, patch = {}) {
  if (!isProtectedCompany(company)) return
  const nextName = patch.name != null ? String(patch.name).trim() : null
  const nextSlug = patch.slug != null ? String(patch.slug).trim() : null
  if (nextName != null && nextName !== String(company.name || '').trim()) {
    throw new ProtectedCompanyError('PROTECTED_COMPANY')
  }
  if (nextSlug != null && nextSlug !== String(company.slug || '').trim()) {
    throw new ProtectedCompanyError('PROTECTED_COMPANY')
  }
}

export function assertCanChangeStatus(company) {
  if (isProtectedCompany(company)) throw new ProtectedCompanyError('PROTECTED_COMPANY')
}

export function assertCanSoftDelete(company) {
  if (isProtectedCompany(company)) throw new ProtectedCompanyError('PROTECTED_COMPANY')
}

export function assertCanRestore(company) {
  if (isProtectedCompany(company)) throw new ProtectedCompanyError('PROTECTED_COMPANY')
}
