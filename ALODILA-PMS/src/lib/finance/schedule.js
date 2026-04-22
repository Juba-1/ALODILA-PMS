/**
 * Smart payment-scheduling engine (finance).
 *
 * Semantics (the ONLY place these rules should live):
 * - `contract_value` is the **TOTAL rent value** of the lease (SAR). The sum of
 *   all generated installment `subtotal_amount`s (rent portion only) MUST equal
 *   `contract_value` exactly, to the halalah.
 * - `utility_flat_amount_sar` (when `utility_payment_type === 'مقطوع'`) is the
 *   **monthly** flat utility add-on. Its total contribution to the lease is
 *   `utility_flat_amount_sar × months_total` and it is spread across the same
 *   installments as rent (last installment absorbs any rounding remainder).
 * - `billing_cycle` (Arabic: شهري / ربع سنوي / نصف سنوي / سنوي) controls the
 *   number of months per installment and therefore the number of installments.
 *
 * Rounding: every computation is performed in "halalas" (integer cents). The
 * final installment absorbs any fractional remainder so invoices reconcile to
 * the cent without drift (e.g. 22,200 / 13 → 12× 1,707.69 + 1× 1,707.72).
 */

import { centsToMoneyString, moneyToCents } from '../money/cents'

export const BILLING_CYCLES = ['شهري', 'ربع سنوي', 'نصف سنوي', 'سنوي']

/** Months per installment, keyed by the canonical billing_cycle enum. */
export const BILLING_MONTHS = Object.freeze({
  شهري: 1,
  'ربع سنوي': 3,
  'نصف سنوي': 6,
  سنوي: 12,
})

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Parse an ISO date string (YYYY-MM-DD) into UTC {y,m,d}. */
function parseIsoDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

/**
 * Add N calendar months to an ISO date. Day is clamped to the target month's
 * last day to avoid JS-date rollover surprises (e.g. Jan 31 + 1 month).
 */
export function addMonths(iso, months) {
  const parsed = parseIsoDate(iso)
  if (!parsed) return String(iso || '')
  const total = (parsed.m - 1) + Number(months || 0)
  const newYear = parsed.y + Math.floor(total / 12)
  const raw = total % 12
  const newMonth = raw < 0 ? raw + 12 : raw
  const daysInMonth = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate()
  const newDay = Math.min(parsed.d, daysInMonth)
  return `${newYear}-${pad2(newMonth + 1)}-${pad2(newDay)}`
}

/** Returns an ISO YYYY-MM-DD for today (UTC). */
export function todayIso() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** Strict ISO comparison: a < b, a === b, a > b. */
export function compareIso(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

/** Two ISO dates share the same `YYYY-MM` prefix. */
export function isSameMonth(a, b) {
  return String(a || '').slice(0, 7) === String(b || '').slice(0, 7)
}

/**
 * Count the whole-months between `start_date` and `end_date` (inclusive of the
 * start month). Used to derive total lease duration for reporting.
 */
export function monthsBetween(start_date, end_date) {
  const s = parseIsoDate(start_date)
  const e = parseIsoDate(end_date)
  if (!s || !e) return 0
  const raw = (e.y - s.y) * 12 + (e.m - s.m)
  const dayAdjusted = e.d >= s.d ? raw + 1 : raw
  return Math.max(1, dayAdjusted)
}

/**
 * Count the installments produced for a given contract shape (mirrors the
 * date-generation loop in `computeInstallmentSchedule` without allocating
 * each installment object — handy for quick UI previews).
 */
export function countInstallments({ start_date, end_date, billing_cycle } = {}) {
  if (!start_date || !end_date || compareIso(end_date, start_date) < 0) return 0
  const monthsPerInstall = BILLING_MONTHS[billing_cycle] ?? 1
  let count = 0
  for (let i = 0; i < 2000; i++) {
    const due = addMonths(start_date, i * monthsPerInstall)
    if (compareIso(due, end_date) > 0) break
    count += 1
  }
  return Math.max(count, 1)
}

/**
 * Compute the installment plan.
 *
 * @param {Object} input
 * @param {number|string} input.contract_value            TOTAL rent for the whole lease (SAR).
 * @param {string} input.start_date                       YYYY-MM-DD.
 * @param {string} input.end_date                         YYYY-MM-DD.
 * @param {string} input.billing_cycle                    One of `BILLING_CYCLES`.
 * @param {string} [input.utility_payment_type='مستقل']   Utility agreement.
 * @param {number|string} [input.utility_flat_amount_sar] Monthly flat utility (when مقطوع).
 * @param {boolean} [input.vat_applicable=false]          Apply 15% VAT.
 *
 * @returns {{
 *   installments: Array,
 *   total_contract_value: number,
 *   total_utility_value: number,
 *   total_lease_value: number,
 *   total_invoiced: number,
 *   count: number,
 *   months_total: number,
 *   months_per_installment: number,
 *   monthly_rent_equivalent: number,
 *   per_installment_rent: number,
 *   per_installment_utility: number,
 * }}
 */
export function computeInstallmentSchedule({
  contract_value,
  start_date,
  end_date,
  billing_cycle,
  utility_payment_type = 'مستقل',
  utility_flat_amount_sar = null,
  vat_applicable = false,
} = {}) {
  const empty = {
    installments: [],
    total_contract_value: 0,
    total_utility_value: 0,
    total_lease_value: 0,
    total_invoiced: 0,
    count: 0,
    months_total: 0,
    months_per_installment: BILLING_MONTHS[billing_cycle] ?? 1,
    monthly_rent_equivalent: 0,
    per_installment_rent: 0,
    per_installment_utility: 0,
  }

  if (!start_date || !end_date || compareIso(end_date, start_date) < 0) return empty

  const monthsPerInstall = BILLING_MONTHS[billing_cycle] ?? 1
  const monthsTotal = monthsBetween(start_date, end_date)

  // Clamp to non-negative cents to defend the rest of the pipeline against
  // pathological inputs (negative contract value, NaN, "abc", …). This keeps
  // downstream UIs safe — no negative invoices, no floor-rounding oddities.
  const totalRentCents = Math.max(0, moneyToCents(contract_value))
  const rawUtilCents = utility_payment_type === 'مقطوع' ? moneyToCents(utility_flat_amount_sar) : 0
  const monthlyFlatCents = Math.max(0, rawUtilCents)
  const totalUtilityCents = monthlyFlatCents * Math.max(0, monthsTotal)

  const dueDates = []
  for (let i = 0; i < 2000; i++) {
    const due = addMonths(start_date, i * monthsPerInstall)
    if (compareIso(due, end_date) > 0) break
    dueDates.push(due)
  }
  if (dueDates.length === 0) dueDates.push(start_date)

  const count = dueDates.length

  const perRentCents = Math.floor(totalRentCents / count)
  const rentRemainderCents = totalRentCents - perRentCents * count

  const perUtilCents = Math.floor(totalUtilityCents / count)
  const utilRemainderCents = totalUtilityCents - perUtilCents * count

  const installments = dueDates.map((due_date, idx) => {
    const isLast = idx === count - 1
    const rentCents = perRentCents + (isLast ? rentRemainderCents : 0)
    const utilCents = perUtilCents + (isLast ? utilRemainderCents : 0)
    const subtotalCents = rentCents + utilCents
    const vatCents = vat_applicable ? Math.round(subtotalCents * 0.15) : 0
    const totalCents = subtotalCents + vatCents
    return {
      index: idx + 1,
      due_date,
      rent_cents: rentCents,
      utility_cents: utilCents,
      subtotal_cents: subtotalCents,
      vat_amount_cents: vatCents,
      total_cents: totalCents,
      vat_applicable: Boolean(vat_applicable),
      rent_amount: Number(centsToMoneyString(rentCents)),
      utility_amount: Number(centsToMoneyString(utilCents)),
      subtotal_amount: Number(centsToMoneyString(subtotalCents)),
      vat_amount: Number(centsToMoneyString(vatCents)),
      total_amount: Number(centsToMoneyString(totalCents)),
      status: 'pending',
    }
  })

  const totalInvoicedCents = installments.reduce((s, i) => s + i.total_cents, 0)
  const totalLeaseCents = totalRentCents + totalUtilityCents
  const monthlyRentEqCents = monthsTotal > 0 ? Math.round(totalRentCents / monthsTotal) : 0

  return {
    installments,
    total_contract_value: Number(centsToMoneyString(totalRentCents)),
    total_utility_value: Number(centsToMoneyString(totalUtilityCents)),
    total_lease_value: Number(centsToMoneyString(totalLeaseCents)),
    total_invoiced: Number(centsToMoneyString(totalInvoicedCents)),
    count,
    months_total: monthsTotal,
    months_per_installment: monthsPerInstall,
    monthly_rent_equivalent: Number(centsToMoneyString(monthlyRentEqCents)),
    per_installment_rent: Number(centsToMoneyString(perRentCents)),
    per_installment_utility: Number(centsToMoneyString(perUtilCents)),
  }
}

/**
 * Suggest the subtotal for a one-off manual invoice against a contract. With
 * the new semantics, `contract.contract_value` is a **total**, so we must
 * derive the per-installment figure from the billing cycle and lease duration.
 * Falls back gracefully when dates are missing.
 *
 * @param {{
 *   contract_value?: unknown,
 *   start_date?: string|null,
 *   end_date?: string|null,
 *   billing_cycle?: string|null,
 *   utility_payment_type?: string|null,
 *   utility_flat_amount_sar?: unknown,
 * } | null | undefined} c
 */
export function perInstallmentSubtotalFromContract(c) {
  if (!c) return 0
  const schedule = computeInstallmentSchedule({
    contract_value: c.contract_value,
    start_date: c.start_date,
    end_date: c.end_date,
    billing_cycle: c.billing_cycle || 'شهري',
    utility_payment_type: c.utility_payment_type || 'مستقل',
    utility_flat_amount_sar: c.utility_flat_amount_sar,
    vat_applicable: false,
  })
  if (schedule.count > 0) {
    // Use the per-installment figure (not the last one's remainder), so manual
    // invoices don't "pre-bake" the rounding leftover.
    return Number((schedule.per_installment_rent + schedule.per_installment_utility).toFixed(2))
  }
  // No dates yet — return zero (UI prompts user to set dates first).
  return 0
}

/**
 * Tiny helper used by UI components to classify an existing invoice by due
 * date + paid amount. Keeps the color logic in one place so Timeline widgets
 * never disagree.
 *
 * @param {{ due_date?: string, total_amount?: number|string, paid_amount?: number|string, payments?: Array<{amount?: number|string, is_deleted?: boolean}> }} inv
 * @param {string} [nowIso]
 * @returns {'paid'|'pending'|'overdue'|'partial'}
 */
export function classifyInstallment(inv, nowIso = todayIso()) {
  if (!inv) return 'pending'
  const totalCents = moneyToCents(inv.total_amount)
  let paidCents
  if (inv.paid_amount != null) {
    paidCents = moneyToCents(inv.paid_amount)
  } else if (Array.isArray(inv.payments)) {
    paidCents = inv.payments
      .filter((p) => p && p.is_deleted !== true)
      .reduce((s, p) => s + moneyToCents(p?.amount), 0)
  } else {
    paidCents = 0
  }

  if (totalCents > 0 && paidCents >= totalCents) return 'paid'
  if (paidCents > 0 && paidCents < totalCents) return 'partial'
  if (compareIso(inv.due_date, nowIso) < 0) return 'overdue'
  return 'pending'
}
