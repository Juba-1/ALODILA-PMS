import { ALODILA_COMPANY_ID, ALODILA_COMPANY_SLUG } from './constants.js'

export function isLoginBound(company) {
  return Boolean(company?.auth_user_id)
}

export function isAlodilaCompany(company) {
  if (!company) return false
  return company.id === ALODILA_COMPANY_ID || company.slug === ALODILA_COMPANY_SLUG
}

export function formatCompanyDate(value, locale = 'ar') {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-SA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return '—'
  }
}

export function loginBindingLabel(company, t) {
  return isLoginBound(company) ? t('platform.login.bound') : t('platform.login.unbound')
}
