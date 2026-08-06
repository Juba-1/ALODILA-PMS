import { supabase } from '../supabase/client'
import { moneyToCents } from '../money/cents'
import { resolveReadScope, withCompanyEq, assertRowInScope } from '../tenancy/index.js'

const CHUNK = 2000
const MAX_CHUNKS = 500

async function getContractIdsForTenant(tenantId, scope) {
  const ids = []
  let from = 0
  for (let i = 0; i < MAX_CHUNKS; i += 1) {
    let q = supabase
      .from('contracts')
      .select('id')
      .eq('is_deleted', false)
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .range(from, from + CHUNK - 1)
    q = withCompanyEq(q, scope)
    const { data, error } = await q
    if (error) throw error
    const rows = data || []
    for (const r of rows) if (r?.id) ids.push(r.id)
    if (rows.length < CHUNK) break
    from += CHUNK
  }
  return ids
}

async function getInvoicesForContracts(contractIds, scope) {
  if (!contractIds.length) return []
  // PostgREST has limits on IN lists; chunk them.
  const chunks = []
  for (let i = 0; i < contractIds.length; i += 200) chunks.push(contractIds.slice(i, i + 200))

  const out = []
  for (const ids of chunks) {
    let q = supabase
      .from('invoices')
      .select('id,contract_id,due_date,subtotal_amount,vat_applicable,total_amount,created_at')
      .eq('is_deleted', false)
      .in('contract_id', ids)
      .order('due_date', { ascending: true })
    q = withCompanyEq(q, scope)
    const { data, error } = await q
    if (error) throw error
    out.push(...(data || []))
  }
  return out
}

async function getPaymentsForInvoiceIds(invoiceIds, scope) {
  if (!invoiceIds.length) return []
  const chunks = []
  for (let i = 0; i < invoiceIds.length; i += 200) chunks.push(invoiceIds.slice(i, i + 200))

  const out = []
  for (const ids of chunks) {
    let q = supabase
      .from('payments')
      .select('id,invoice_id,payment_date,amount,created_at')
      .eq('is_deleted', false)
      .in('invoice_id', ids)
      .order('payment_date', { ascending: true })
    q = withCompanyEq(q, scope)
    const { data, error } = await q
    if (error) throw error
    out.push(...(data || []))
  }
  return out
}

function compareLedger(a, b) {
  const da = String(a.date || '')
  const db = String(b.date || '')
  if (da < db) return -1
  if (da > db) return 1
  // On the same day: debits first (invoice before payment) for a statement feel.
  if (a.kind !== b.kind) return a.kind === 'debit' ? -1 : 1
  const ca = String(a.created_at || '')
  const cb = String(b.created_at || '')
  if (ca < cb) return -1
  if (ca > cb) return 1
  return String(a.id || '').localeCompare(String(b.id || ''))
}

export async function getTenantStatement(tenantId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!tenantId) throw new Error('tenantId is required')

  const scope = await resolveReadScope()
  let tenantQ = supabase
    .from('tenants')
    .select('id,full_name,national_id_or_cr,phone,company_id')
    .eq('is_deleted', false)
    .eq('id', tenantId)
  tenantQ = withCompanyEq(tenantQ, scope)
  const { data: tenantRow, error: tErr } = await tenantQ.maybeSingle()
  if (tErr) throw tErr
  if (!tenantRow?.id) throw new Error('Tenant not found')
  assertRowInScope(tenantRow, scope)

  const contractIds = await getContractIdsForTenant(tenantId, scope)
  const invoices = await getInvoicesForContracts(contractIds, scope)
  const invoiceIds = invoices.map((x) => x.id).filter(Boolean)
  const payments = await getPaymentsForInvoiceIds(invoiceIds, scope)

  const entries = []

  for (const inv of invoices) {
    entries.push({
      id: inv.id,
      kind: 'debit',
      date: inv.due_date,
      created_at: inv.created_at,
      description: `فاتورة إيجار مستحقة`,
      ref: inv.id,
      debit_cents: moneyToCents(inv.total_amount),
      credit_cents: 0,
    })
  }

  for (const p of payments) {
    entries.push({
      id: p.id,
      kind: 'credit',
      date: p.payment_date,
      created_at: p.created_at,
      description: `دفعة محصّلة`,
      ref: p.invoice_id,
      debit_cents: 0,
      credit_cents: moneyToCents(p.amount),
    })
  }

  entries.sort(compareLedger)

  let running = 0
  const withBalance = entries.map((e) => {
    running += (e.debit_cents || 0) - (e.credit_cents || 0)
    return { ...e, balance_cents: running }
  })

  const totals = withBalance.reduce(
    (acc, e) => {
      acc.debit_cents += e.debit_cents || 0
      acc.credit_cents += e.credit_cents || 0
      return acc
    },
    { debit_cents: 0, credit_cents: 0 },
  )

  return {
    tenant: tenantRow,
    totals: {
      total_debits_cents: totals.debit_cents,
      total_credits_cents: totals.credit_cents,
      outstanding_cents: Math.max(0, totals.debit_cents - totals.credit_cents),
    },
    entries: withBalance,
  }
}
