/**
 * Pure functions for the Reports Center.
 *
 * All calculations are deterministic and currency-safe (integer SAR for
 * chart display is OK because we already round at the invoice boundary —
 * but where summed amounts matter for exports/VAT we still rely on the
 * `paid_amount` / `total_amount` values already stored by the backend).
 *
 * These helpers are intentionally decoupled from React so they can be
 * unit-tested and reused from the owner portal, PDF exports, etc.
 */

import { paymentStatusOfInvoice, remainingOnInvoice, sumPaid } from '../finance/invoiceDerived'

const MS_DAY = 24 * 60 * 60 * 1000

export function todayIsoDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoToDate(iso) {
  if (!iso) return null
  const s = String(iso).slice(0, 10)
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysDiffIso(a, b) {
  const da = isoToDate(a)
  const db = isoToDate(b)
  if (!da || !db) return null
  return Math.round((db.getTime() - da.getTime()) / MS_DAY)
}

function monthKey(iso) {
  if (!iso) return ''
  const s = String(iso).slice(0, 7)
  return s.length === 7 ? s : ''
}

/**
 * Build an array of month keys (YYYY-MM) inclusive between two ISO dates.
 * Capped to 36 months for chart legibility.
 */
export function monthRange(fromIso, toIso) {
  const a = isoToDate(fromIso)
  const b = isoToDate(toIso)
  if (!a || !b || b < a) return []
  const out = []
  const start = new Date(a.getFullYear(), a.getMonth(), 1)
  const end = new Date(b.getFullYear(), b.getMonth(), 1)
  const cursor = new Date(start)
  let guard = 0
  while (cursor <= end && guard < 36) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    out.push(`${y}-${m}`)
    cursor.setMonth(cursor.getMonth() + 1)
    guard += 1
  }
  return out
}

/**
 * @param {Array<{payment_date: string, amount: number, property_id?: string}>} payments
 */
export function buildMonthlyCashflow(payments, { fromIso, toIso, propertyId = '' } = {}) {
  const months = monthRange(fromIso, toIso)
  const buckets = new Map(months.map((m) => [m, 0]))
  for (const p of payments || []) {
    const mk = monthKey(p.payment_date)
    if (!mk || !buckets.has(mk)) continue
    if (propertyId && String(p.property_id || '') !== propertyId) continue
    buckets.set(mk, buckets.get(mk) + Number(p.amount || 0))
  }
  return months.map((m) => ({ month: m, collected: Math.round(buckets.get(m) * 100) / 100 }))
}

/**
 * For each month in range, compute:
 *   - expected: sum of invoices due in that month (total_amount)
 *   - collected: sum of payments with payment_date in that month (scoped to those invoices)
 * @param {Array<any>} invoices  — with payments[] attached
 */
export function buildExpectedVsCollected(invoices, { fromIso, toIso, propertyId = '' } = {}) {
  const months = monthRange(fromIso, toIso)
  const expected = new Map(months.map((m) => [m, 0]))
  const collected = new Map(months.map((m) => [m, 0]))

  for (const inv of invoices || []) {
    const invProp = inv?.property_id || inv?.contract?.unit?.property_id || ''
    if (propertyId && String(invProp) !== propertyId) continue

    const mk = monthKey(inv.due_date)
    if (mk && expected.has(mk)) {
      expected.set(mk, expected.get(mk) + Number(inv.total_amount || 0))
    }

    const payList = Array.isArray(inv.payments) ? inv.payments : []
    for (const pay of payList) {
      if (!pay || pay.is_deleted) continue
      const pk = monthKey(pay.payment_date)
      if (pk && collected.has(pk)) {
        collected.set(pk, collected.get(pk) + Number(pay.amount || 0))
      }
    }
  }

  return months.map((m) => ({
    month: m,
    expected: Math.round(expected.get(m) * 100) / 100,
    collected: Math.round(collected.get(m) * 100) / 100,
  }))
}

/**
 * Aging buckets for delinquency. Returns the total outstanding money per
 * bucket plus the number of invoices.
 */
export function buildAgingBuckets(invoices, { todayIso = todayIsoDate(), propertyId = '' } = {}) {
  const buckets = {
    b0_30: { amount: 0, count: 0 },
    b31_60: { amount: 0, count: 0 },
    b61_90: { amount: 0, count: 0 },
    b90plus: { amount: 0, count: 0 },
  }
  for (const inv of invoices || []) {
    const invProp = inv?.property_id || inv?.contract?.unit?.property_id || ''
    if (propertyId && String(invProp) !== propertyId) continue

    if (!inv.due_date) continue
    const status = paymentStatusOfInvoice(inv)
    if (status === 'مدفوعة بالكامل') continue
    const remaining = remainingOnInvoice(inv)
    if (remaining <= 0) continue

    const daysOver = daysDiffIso(inv.due_date, todayIso)
    if (daysOver == null || daysOver <= 0) continue

    const key =
      daysOver <= 30 ? 'b0_30' : daysOver <= 60 ? 'b31_60' : daysOver <= 90 ? 'b61_90' : 'b90plus'
    buckets[key].amount += remaining
    buckets[key].count += 1
  }
  // round for chart display
  for (const k of Object.keys(buckets)) {
    buckets[k].amount = Math.round(buckets[k].amount * 100) / 100
  }
  return buckets
}

/**
 * Count active leases ending in 0-30 / 31-60 / 61-90 / >90 day windows.
 * @param {Array<any>} contracts — active contracts with `end_date`
 */
export function buildLeaseExpiryForecast(contracts, { todayIso = todayIsoDate(), propertyId = '' } = {}) {
  const out = { b30: 0, b60: 0, b90: 0, beyond: 0, totalActive: 0 }
  for (const c of contracts || []) {
    if (c?.status && c.status !== 'ساري') continue
    const invProp = c?.property_id || c?.unit?.property_id || ''
    if (propertyId && String(invProp) !== propertyId) continue
    if (!c.end_date) continue
    const days = daysDiffIso(todayIso, c.end_date)
    if (days == null) continue
    out.totalActive += 1
    if (days <= 30) out.b30 += 1
    else if (days <= 60) out.b60 += 1
    else if (days <= 90) out.b90 += 1
    else out.beyond += 1
  }
  return out
}

/**
 * Maintenance spend grouped by property within a date range.
 */
export function buildMaintenanceByProperty(maintenance, { fromIso, toIso, propertyId = '' } = {}) {
  const map = new Map()
  for (const m of maintenance || []) {
    if (propertyId && String(m.property_id || '') !== propertyId) continue
    const day = String(m.created_at || '').slice(0, 10)
    if (!day) continue
    if (fromIso && day < fromIso) continue
    if (toIso && day > toIso) continue
    const key = String(m.property_id || 'unknown')
    const cur = map.get(key) || { property_id: key, property_name: m.property_name || '—', total: 0, count: 0 }
    cur.total += Number(m.cost_amount || 0)
    cur.count += 1
    map.set(key, cur)
  }
  return [...map.values()]
    .map((r) => ({ ...r, total: Math.round(r.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Deterministic VAT ledger: for each month in range, compute taxable base,
 * expected VAT (rate × invoiced), and actual VAT (rate × collected).
 * Only invoices flagged `vat_applicable = true` are included.
 */
export function buildVatLedger(invoices, { fromIso, toIso, propertyId = '', ratePct = 15 } = {}) {
  const months = monthRange(fromIso, toIso)
  const taxableByMonth = new Map(months.map((m) => [m, 0]))
  const collectedByMonth = new Map(months.map((m) => [m, 0]))
  const rate = Math.max(0, Number(ratePct) || 0) / 100

  for (const inv of invoices || []) {
    if (!inv.vat_applicable) continue
    const invProp = inv?.property_id || inv?.contract?.unit?.property_id || ''
    if (propertyId && String(invProp) !== propertyId) continue

    const dueKey = monthKey(inv.due_date)
    if (dueKey && taxableByMonth.has(dueKey)) {
      taxableByMonth.set(dueKey, taxableByMonth.get(dueKey) + Number(inv.subtotal_amount || 0))
    }
    const paid = sumPaid(inv)
    // allocate collected VAT to month the PAYMENT happened, not due month
    for (const pay of inv.payments || []) {
      if (!pay || pay.is_deleted) continue
      const pk = monthKey(pay.payment_date)
      if (pk && collectedByMonth.has(pk)) {
        const share = Number(pay.amount || 0)
        // payments are gross; scale by vat_applicable ratio subtotal/total
        const total = Number(inv.total_amount || 0)
        const subtotal = Number(inv.subtotal_amount || 0)
        const ratio = total > 0 ? subtotal / total : 0
        collectedByMonth.set(pk, collectedByMonth.get(pk) + share * ratio)
      }
    }
    void paid
  }
  return months.map((m) => {
    const taxable = taxableByMonth.get(m) || 0
    const collected = collectedByMonth.get(m) || 0
    return {
      month: m,
      taxable: Math.round(taxable * 100) / 100,
      expectedVat: Math.round(taxable * rate * 100) / 100,
      actualVat: Math.round(collected * rate * 100) / 100,
    }
  })
}

/**
 * Range-level totals for the hero KPI strip at the top of Reports.
 */
export function rangeTotals(invoices, { fromIso, toIso, propertyId = '' } = {}) {
  let expected = 0
  let collected = 0
  for (const inv of invoices || []) {
    const invProp = inv?.property_id || inv?.contract?.unit?.property_id || ''
    if (propertyId && String(invProp) !== propertyId) continue
    const mk = monthKey(inv.due_date)
    if (mk && mk >= monthKey(fromIso) && mk <= monthKey(toIso)) {
      expected += Number(inv.total_amount || 0)
    }
    for (const pay of inv.payments || []) {
      if (!pay || pay.is_deleted) continue
      const pk = monthKey(pay.payment_date)
      if (pk && pk >= monthKey(fromIso) && pk <= monthKey(toIso)) {
        collected += Number(pay.amount || 0)
      }
    }
  }
  return {
    expected: Math.round(expected * 100) / 100,
    collected: Math.round(collected * 100) / 100,
    gap: Math.round(Math.max(0, expected - collected) * 100) / 100,
  }
}
