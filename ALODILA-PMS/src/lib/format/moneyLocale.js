/**
 * Formatting helpers that pick a locale tag for Intl while FORCING Latin
 * (Western) digits everywhere — even when the UI language is Arabic.
 *
 * We append the Unicode BCP-47 extension `-u-nu-latn` which instructs
 * `Intl.NumberFormat` / `toLocaleString` to render digits with the `latn`
 * numbering system. This keeps Arabic separators / currency glyphs intact
 * while making sure we never see Eastern Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩).
 */

function withLatnDigits(tag) {
  const base = String(tag || 'en-US')
  if (/\b-u-nu-/i.test(base)) return base
  return `${base}-u-nu-latn`
}

/** Base locale tag (no `-u-nu-*` extension). */
export function moneyLocaleBase(lang) {
  return lang === 'en' ? 'en-SA' : 'ar-SA'
}

/** Locale tag for Intl — SAR formatting, always Latin digits. */
export function moneyLocaleTag(lang) {
  return withLatnDigits(moneyLocaleBase(lang))
}

/** Generic number locale tag for non-currency numbers (still Latin digits). */
export function numberLocaleTag(lang) {
  return withLatnDigits(lang === 'en' ? 'en-US' : 'ar-SA')
}

export function formatMoneyLocale(n, lang) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString(moneyLocaleTag(lang), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format an integer / plain number using the active language's conventions
 * but always with Latin digits (no fractional part by default).
 */
export function formatNumberLocale(n, lang, options) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString(numberLocaleTag(lang), options)
}
