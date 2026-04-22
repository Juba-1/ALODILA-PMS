import { supabase } from '../supabase/client'
import { classifyInstallment, computeInstallmentSchedule } from '../finance/schedule'
import { moneyToCents } from '../money/cents'

/**
 * All financial helpers that are "per-contract": schedule generation,
 * contract-finance read model, KPI rollups. The generic CRUD for invoices
 * and payments stays in their own files.
 */

/** Columns we need when rendering a contract's timeline. */
const CONTRACT_FINANCE_SELECT = `
  id,
  unit_id,
  tenant_id,
  ejar_contract_number,
  start_date,
  end_date,
  actual_handover_date,
  contract_value,
  deposit,
  billing_cycle,
  status,
  utility_payment_type,
  utility_flat_amount_sar,
  handover_notes,
  tenant:tenants(id, full_name, phone),
  unit:units(
    id,
    unit_name,
    property_id,
    property:properties(id, name, category)
  )
`

const INVOICE_FINANCE_SELECT = `
  id,
  contract_id,
  due_date,
  subtotal_amount,
  vat_applicable,
  total_amount,
  created_at,
  payments:payments(id, amount, payment_date, is_deleted)
`

function mapInvoiceWithPaid(inv) {
  const payments = Array.isArray(inv?.payments) ? inv.payments.filter((p) => p && p.is_deleted !== true) : []
  const paidCents = payments.reduce((s, p) => s + moneyToCents(p?.amount), 0)
  const totalCents = moneyToCents(inv?.total_amount)
  return {
    ...inv,
    payments,
    paid_amount: paidCents / 100,
    remaining_amount: Math.max(0, (totalCents - paidCents) / 100),
  }
}

/**
 * Generate pending invoices for a contract (one per installment).
 *
 * @param {{ id: string, contract_value: number|string, start_date: string, end_date: string, billing_cycle: string, utility_payment_type?: string, utility_flat_amount_sar?: number|null }} contract
 * @param {{ vat_applicable?: boolean, replaceExisting?: boolean }} [options]
 */
export async function generateInstallmentsForContract(contract, options = {}) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!contract?.id) throw new Error('contract.id is required')

  // Pre-flight guards — never insert phantom rows the UI would struggle to
  // explain. Friendly Arabic messages so the toast layer can surface them.
  if (!contract.start_date || !contract.end_date) {
    throw new Error('لا يمكن توليد الدفعات بدون تاريخي بداية ونهاية صحيحين للعقد.')
  }
  const contractCents = moneyToCents(contract.contract_value)
  if (!Number.isFinite(contractCents) || contractCents <= 0) {
    throw new Error('قيمة العقد الإجمالية يجب أن تكون أكبر من صفر قبل توليد جدول الدفعات.')
  }

  const { vat_applicable = false, replaceExisting = false } = options

  if (replaceExisting) {
    const { error: delErr } = await supabase
      .from('invoices')
      .update({ is_deleted: true })
      .eq('contract_id', contract.id)
      .eq('is_deleted', false)
    if (delErr) throw delErr
  }

  const { installments } = computeInstallmentSchedule({
    contract_value: contract.contract_value,
    start_date: contract.start_date,
    end_date: contract.end_date,
    billing_cycle: contract.billing_cycle,
    utility_payment_type: contract.utility_payment_type,
    utility_flat_amount_sar: contract.utility_flat_amount_sar,
    vat_applicable,
  })

  if (!installments.length) return { inserted: [], skipped: true, count: 0 }

  const payload = installments.map((inst) => ({
    contract_id: contract.id,
    due_date: inst.due_date,
    subtotal_amount: inst.subtotal_amount,
    vat_applicable: Boolean(vat_applicable),
    total_amount: inst.total_amount,
    is_deleted: false,
  }))

  const { data, error } = await supabase
    .from('invoices')
    .insert(payload)
    .select('id, contract_id, due_date, subtotal_amount, total_amount, vat_applicable, created_at')

  if (error) throw error
  return { inserted: data || [], skipped: false, count: payload.length }
}

/**
 * Full finance read-model for a contract detail view / AI advisor.
 * Returns the contract, its invoices (with payments), and aggregate KPIs.
 *
 * All money-facing numbers are cents-accurate (see `moneyToCents`).
 */
export async function getContractFinance(contractId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!contractId) throw new Error('contractId is required')

  const { data: contractRow, error: cErr } = await supabase
    .from('contracts')
    .select(CONTRACT_FINANCE_SELECT)
    .eq('id', contractId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (cErr) throw cErr
  if (!contractRow?.id) throw new Error('Contract not found')

  const { data: invoiceRows, error: iErr } = await supabase
    .from('invoices')
    .select(INVOICE_FINANCE_SELECT)
    .eq('contract_id', contractId)
    .eq('is_deleted', false)
    .order('due_date', { ascending: true })

  if (iErr) throw iErr

  const invoices = (invoiceRows || []).map(mapInvoiceWithPaid)

  let totalInvoicedCents = 0
  let totalPaidCents = 0
  let paidCount = 0
  let overdueCount = 0
  let pendingCount = 0
  let partialCount = 0

  for (const inv of invoices) {
    totalInvoicedCents += moneyToCents(inv.total_amount)
    totalPaidCents += moneyToCents(inv.paid_amount)
    const cls = classifyInstallment(inv)
    if (cls === 'paid') paidCount += 1
    else if (cls === 'overdue') overdueCount += 1
    else if (cls === 'partial') partialCount += 1
    else pendingCount += 1
  }

  return {
    contract: contractRow,
    invoices,
    summary: {
      invoiceCount: invoices.length,
      totalInvoiced: totalInvoicedCents / 100,
      totalPaid: totalPaidCents / 100,
      outstanding: Math.max(0, (totalInvoicedCents - totalPaidCents) / 100),
      paidCount,
      pendingCount,
      overdueCount,
      partialCount,
    },
  }
}

export { classifyInstallment }
