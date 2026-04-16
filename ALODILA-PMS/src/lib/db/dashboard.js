import { supabase } from '../supabase/client'
import { paymentStatusOfInvoice } from '../finance/invoiceDerived'
import { sumInvoicesTotalAndMonth, sumMaintenanceCostAndMonth, sumPaymentsAmountAndMonth } from './ledgerTotals'
import { centsToMoneyString } from '../money/cents'

function isoTodayLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoAddDaysLocal(iso, days) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetweenISO(a, b) {
  const x = new Date(`${a}T00:00:00`).getTime()
  const y = new Date(`${b}T00:00:00`).getTime()
  return Math.floor((y - x) / (1000 * 60 * 60 * 24))
}

async function fetchPortfolioCounts() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const [propsRes, unitsRes, contractsRes] = await Promise.all([
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
    supabase.from('units').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
    supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .eq('status', 'ساري'),
  ])

  if (propsRes.error) throw propsRes.error
  if (unitsRes.error) throw unitsRes.error
  if (contractsRes.error) throw contractsRes.error

  return {
    propertiesCount: propsRes.count || 0,
    unitsCount: unitsRes.count || 0,
    activeContractsCount: contractsRes.count || 0,
  }
}

export async function getDashboardStats() {
  const [counts, payRoll, invRoll] = await Promise.all([
    fetchPortfolioCounts(),
    sumPaymentsAmountAndMonth(null),
    sumInvoicesTotalAndMonth(null),
  ])
  const totalInvoicedCents = invRoll.totalAllTimeCents
  const totalCollectedCents = payRoll.totalAllTimeCents
  const outstandingCents = Math.max(0, totalInvoicedCents - totalCollectedCents)
  return {
    ...counts,
    totalRevenue: Number(centsToMoneyString(totalCollectedCents)),
    kpi: {
      totalInvoicedSar: centsToMoneyString(totalInvoicedCents),
      totalCollectedSar: centsToMoneyString(totalCollectedCents),
      outstandingSar: centsToMoneyString(outstandingCents),
    },
  }
}

/**
 * One batched read for AI context: counts + payment & maintenance rollups (no PostgREST aggregates).
 * @param {string} monthKey `YYYY-MM`
 */
export async function loadAdminLedgerForAi(monthKey) {
  const [counts, payRoll, maintRoll] = await Promise.all([
    fetchPortfolioCounts(),
    sumPaymentsAmountAndMonth(monthKey),
    sumMaintenanceCostAndMonth(monthKey),
  ])
  return {
    stats: {
      ...counts,
      totalRevenue: Number(centsToMoneyString(payRoll.totalAllTimeCents)),
    },
    payRoll,
    maintRoll,
  }
}

export async function getRecentActivity() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const [contractsRes, paymentsRes] = await Promise.all([
    supabase
      .from('contracts')
      .select(
        `
        id,
        created_at,
        start_date,
        end_date,
        contract_value,
        status,
        tenant:tenants(id, full_name, is_deleted),
        unit:units(id, unit_name, is_deleted)
      `,
      )
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('payments')
      .select(
        `
        id,
        created_at,
        payment_date,
        amount,
        invoice:invoices(
          id,
          is_deleted,
          contract:contracts(
            id,
            is_deleted,
            tenant:tenants(id, full_name, is_deleted),
            unit:units(id, unit_name, is_deleted)
          )
        )
      `,
      )
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (contractsRes.error) throw contractsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const recentContracts = (contractsRes.data || [])
    .filter((c) => c?.tenant && c?.unit && c.tenant.is_deleted !== true && c.unit.is_deleted !== true)
    .map((c) => ({
      id: c.id,
      created_at: c.created_at,
      tenant_full_name: c?.tenant?.full_name || '',
      unit_name: c?.unit?.unit_name || '',
      start_date: c.start_date,
      end_date: c.end_date,
      status: c.status,
      contract_value: c.contract_value,
    }))

  const recentPayments = (paymentsRes.data || [])
    .filter((p) => {
      const inv = p?.invoice
      if (!inv || inv.is_deleted) return false
      const con = inv?.contract
      if (!con || con.is_deleted) return false
      if (con.tenant?.is_deleted || con.unit?.is_deleted) return false
      return true
    })
    .map((p) => ({
      id: p.id,
      created_at: p.created_at,
      payment_date: p.payment_date,
      amount: p.amount,
      tenant_full_name: p?.invoice?.contract?.tenant?.full_name || '',
      unit_name: p?.invoice?.contract?.unit?.unit_name || '',
      invoice_id: p?.invoice?.id || '',
    }))

  return { recentContracts, recentPayments }
}

export async function getProactiveAlerts() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const today = isoTodayLocal()
  const horizon = isoAddDaysLocal(today, 30)

  const [contractsRes, invoicesRes] = await Promise.all([
    supabase
      .from('contracts')
      .select(
        `
        id,
        end_date,
        ejar_contract_number,
        status,
        tenant:tenants(full_name),
        unit:units(unit_name, property:properties(name))
      `,
      )
      .eq('is_deleted', false)
      .eq('status', 'ساري')
      .gte('end_date', today)
      .lte('end_date', horizon)
      .order('end_date', { ascending: true })
      .limit(50),
    /**
     * Overdue invoices only (narrow filter) — no nested `payments` embed (avoids huge joins / timeouts).
     * Payment lines loaded in a second batched query by invoice_id.
     */
    supabase
      .from('invoices')
      .select(
        `
        id,
        due_date,
        total_amount,
        contract:contracts(
          is_deleted,
          tenant:tenants(full_name, phone),
          unit:units(unit_name, property:properties(name))
        )
      `,
      )
      .eq('is_deleted', false)
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(120),
  ])

  if (contractsRes.error) throw contractsRes.error
  if (invoicesRes.error) throw invoicesRes.error

  const expiringContracts = (contractsRes.data || []).map((c) => ({
    id: c.id,
    end_date: c.end_date,
    ejar_contract_number: c.ejar_contract_number || null,
    tenant_full_name: c?.tenant?.full_name || '',
    unit_name: c?.unit?.unit_name || '',
    property_name: c?.unit?.property?.name || '',
    days_until_end: daysBetweenISO(today, String(c.end_date || today)),
  }))

  const invRows = invoicesRes.data || []
  const invIds = invRows.map((r) => r.id).filter(Boolean)

  /** @type {Map<string, Array<{ amount: unknown, is_deleted?: boolean }>>} */
  const paymentsByInvoice = new Map()
  if (invIds.length) {
    const { data: payRows, error: payErr } = await supabase
      .from('payments')
      .select('invoice_id, amount, is_deleted')
      .eq('is_deleted', false)
      .in('invoice_id', invIds)
    if (payErr) throw payErr
    for (const p of payRows || []) {
      const iid = p.invoice_id
      if (!iid) continue
      if (!paymentsByInvoice.has(iid)) paymentsByInvoice.set(iid, [])
      paymentsByInvoice.get(iid).push({ amount: p.amount, is_deleted: p.is_deleted })
    }
  }

  const overdueInvoices = invRows
    .filter((inv) => !inv?.contract?.is_deleted)
    .map((inv) => ({
      ...inv,
      payments: paymentsByInvoice.get(inv.id) || [],
    }))
    .filter((inv) => paymentStatusOfInvoice(inv) !== 'مدفوعة بالكامل')
    .map((inv) => ({
      id: inv.id,
      due_date: inv.due_date,
      total_amount: inv.total_amount,
      tenant_full_name: inv?.contract?.tenant?.full_name || '',
      tenant_phone: inv?.contract?.tenant?.phone || '',
      unit_name: inv?.contract?.unit?.unit_name || '',
      property_name: inv?.contract?.unit?.property?.name || '',
      payment_status: paymentStatusOfInvoice(inv),
      days_overdue: daysBetweenISO(String(inv.due_date), today),
    }))

  return { expiringContracts, overdueInvoices }
}

