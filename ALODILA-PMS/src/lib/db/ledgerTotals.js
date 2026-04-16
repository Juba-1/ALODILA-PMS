import { supabase } from '../supabase/client'
import { moneyToCents } from '../money/cents'

/** Chunk size per request — bounded rows avoid statement timeouts vs loading entire tables. */
const CHUNK = 2000
const MAX_CHUNKS = 500

/**
 * Sum `payments.amount` with optional calendar-month filter on `payment_date` (YYYY-MM-…).
 * Uses stable `id` ordering + range paging (valid PostgREST — no aggregate select).
 * @param {string | null | undefined} monthKey e.g. `2026-04` or null/empty to skip month subtotal
 */
export async function sumPaymentsAmountAndMonth(monthKey) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const wantMonth = Boolean(monthKey && String(monthKey).length >= 7)
  const prefix = wantMonth ? String(monthKey).slice(0, 7) : ''

  let totalAllTimeCents = 0
  let revenueThisCalendarMonthCents = 0
  let from = 0

  for (let i = 0; i < MAX_CHUNKS; i += 1) {
    const { data, error } = await supabase
      .from('payments')
      .select('amount, payment_date')
      .eq('is_deleted', false)
      .order('id', { ascending: true })
      .range(from, from + CHUNK - 1)

    if (error) throw error
    const rows = data || []
    for (const r of rows) {
      const aCents = moneyToCents(r.amount)
      totalAllTimeCents += aCents
      if (wantMonth && String(r.payment_date || '').startsWith(prefix)) {
        revenueThisCalendarMonthCents += aCents
      }
    }
    if (rows.length < CHUNK) break
    from += CHUNK
  }

  return { totalAllTimeCents, revenueThisCalendarMonthCents }
}

/**
 * Sum `maintenance_requests.cost_amount` with optional month filter on `created_at` (ISO string).
 * @param {string | null | undefined} monthKey `YYYY-MM`
 */
export async function sumMaintenanceCostAndMonth(monthKey) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const wantMonth = Boolean(monthKey && String(monthKey).length >= 7)
  const prefix = wantMonth ? String(monthKey).slice(0, 7) : ''

  let totalAllTimeCents = 0
  let maintenanceThisCalendarMonthCents = 0
  let from = 0

  for (let i = 0; i < MAX_CHUNKS; i += 1) {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .select('cost_amount, created_at')
      .eq('is_deleted', false)
      .order('id', { ascending: true })
      .range(from, from + CHUNK - 1)

    if (error) throw error
    const rows = data || []
    for (const r of rows) {
      const cCents = moneyToCents(r.cost_amount)
      totalAllTimeCents += cCents
      if (wantMonth && String(r.created_at || '').slice(0, 7) === prefix) {
        maintenanceThisCalendarMonthCents += cCents
      }
    }
    if (rows.length < CHUNK) break
    from += CHUNK
  }

  return { totalAllTimeCents, maintenanceThisCalendarMonthCents }
}

/**
 * Sum `invoices.total_amount` with optional calendar-month filter on `due_date` (YYYY-MM-…).
 * @param {string | null | undefined} monthKey e.g. `2026-04` or null to skip month subtotal
 */
export async function sumInvoicesTotalAndMonth(monthKey) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const wantMonth = Boolean(monthKey && String(monthKey).length >= 7)
  const prefix = wantMonth ? String(monthKey).slice(0, 7) : ''

  let totalAllTimeCents = 0
  let invoicedThisCalendarMonthCents = 0
  let from = 0

  for (let i = 0; i < MAX_CHUNKS; i += 1) {
    const { data, error } = await supabase
      .from('invoices')
      .select('total_amount, due_date')
      .eq('is_deleted', false)
      .order('id', { ascending: true })
      .range(from, from + CHUNK - 1)

    if (error) throw error
    const rows = data || []
    for (const r of rows) {
      const aCents = moneyToCents(r.total_amount)
      totalAllTimeCents += aCents
      if (wantMonth && String(r.due_date || '').startsWith(prefix)) {
        invoicedThisCalendarMonthCents += aCents
      }
    }
    if (rows.length < CHUNK) break
    from += CHUNK
  }

  return { totalAllTimeCents, invoicedThisCalendarMonthCents }
}
