/** Locale tag for Intl — SAR formatting. */
export function moneyLocaleTag(lang) {
  return lang === 'en' ? 'en-SA' : 'ar-SA'
}

export function formatMoneyLocale(n, lang) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString(moneyLocaleTag(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
