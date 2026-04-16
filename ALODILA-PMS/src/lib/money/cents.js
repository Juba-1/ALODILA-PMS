/**
 * Money utilities (audit-safe):
 * - Convert DB numeric strings / JS numbers into integer "halalas" (cents) to avoid float drift.
 * - Convert cents back to a 2-decimal string for rendering.
 */

/** @param {unknown} v */
export function moneyToCents(v) {
  if (v == null) return 0

  // Supabase PostgREST often returns `numeric` as string. Keep it exact.
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return 0
    // Remove commas/spaces. Keep leading minus if any.
    const cleaned = s.replace(/[, ]/g, '')
    const m = cleaned.match(/^(-)?(\d+)(?:\.(\d{1,}))?$/)
    if (!m) return 0
    const sign = m[1] ? -1 : 1
    const intPart = m[2] || '0'
    const fracRaw = m[3] || ''
    const frac = (fracRaw + '00').slice(0, 2) // truncate to 2 decimals (DB is numeric(12,2) anyway)
    const cents = Number(intPart) * 100 + Number(frac)
    return sign * (Number.isFinite(cents) ? cents : 0)
  }

  // Fallback (numbers) — best effort
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 0
    return Math.round(v * 100)
  }

  return 0
}

/** @param {number} cents */
export function centsToMoneyString(cents) {
  const n = Number(cents)
  if (!Number.isFinite(n)) return '0.00'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(n))
  const intPart = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${intPart}.${frac}`
}

