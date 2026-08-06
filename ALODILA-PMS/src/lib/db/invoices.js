import { supabase } from '../supabase/client'
import {
  resolveWriteCompany,
  stampInsert,
  assertParentInWriteCompany,
  resolveReadScope,
  withCompanyEq,
  withWriteCompanyEq,
  assertRowInScope,
} from '../tenancy/index.js'

const INVOICE_SELECT = `
      id,
      contract_id,
      due_date,
      subtotal_amount,
      vat_applicable,
      total_amount,
      created_at,
      updated_at,
      company_id,
      contract:contracts(
        id,
        is_deleted,
        ejar_contract_number,
        start_date,
        end_date,
        billing_cycle,
        contract_value,
        utility_payment_type,
        utility_flat_amount_sar,
        tenant:tenants(id, full_name, phone, is_deleted),
        unit:units(
          id,
          unit_name,
          is_deleted,
          property_id,
          property:properties(id, name, category)
        )
      ),
      payments:payments(
        id,
        amount,
        payment_date,
        is_deleted
      )
    `

function mapInvoice(inv) {
  return {
    ...inv,
    tenant_full_name: inv?.contract?.tenant?.full_name || '',
    tenant_phone: inv?.contract?.tenant?.phone || '',
    unit_name: inv?.contract?.unit?.unit_name || '',
    property_id: inv?.contract?.unit?.property_id || inv?.contract?.unit?.property?.id || '',
    property_name: inv?.contract?.unit?.property?.name || '',
    property_category: inv?.contract?.unit?.property?.category || '',
    ejar_contract_number: inv?.contract?.ejar_contract_number || null,
  }
}

function filterAndMapInvoices(rows) {
  return (rows || [])
    .filter(
      (inv) =>
        inv?.contract &&
        inv.contract.is_deleted !== true &&
        inv.contract.tenant?.is_deleted !== true &&
        inv.contract.unit?.is_deleted !== true,
    )
    .map(mapInvoice)
}

export async function getInvoices() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const scope = await resolveReadScope()
  let q = supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('is_deleted', false)
    .order('due_date', { ascending: false })
  q = withCompanyEq(q, scope)
  const { data, error } = await q

  if (error) throw error

  return filterAndMapInvoices(data)
}

export async function getInvoiceById(invoiceId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!invoiceId) throw new Error('invoiceId is required')

  const scope = await resolveReadScope()
  let q = supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('is_deleted', false)
    .eq('id', invoiceId)
  q = withCompanyEq(q, scope)
  const { data, error } = await q.maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Invoice not found')
  assertRowInScope(data, scope)

  const mapped = filterAndMapInvoices([data])[0]
  if (!mapped) throw new Error('Invoice not accessible')
  return mapped
}

/** Scoped invoice list for owner portal (contracts already limited to owner properties). Read-only. */
export async function getInvoicesForContractIds(contractIds) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!Array.isArray(contractIds) || contractIds.length === 0) return []

  const scope = await resolveReadScope()
  let q = supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('is_deleted', false)
    .in('contract_id', contractIds)
    .order('due_date', { ascending: false })
  q = withCompanyEq(q, scope)
  const { data, error } = await q

  if (error) throw error
  return filterAndMapInvoices(data)
}

export async function createInvoice(input) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = {
    contract_id: input.contract_id,
    due_date: input.due_date,
    subtotal_amount: Number(input.subtotal_amount),
    vat_applicable: Boolean(input.vat_applicable),
    total_amount: Number(input.total_amount),
    is_deleted: false,
  }

  const write = await resolveWriteCompany()
  await assertParentInWriteCompany('contracts', payload.contract_id, write.companyId, 'contract')
  const stamped = stampInsert(payload, write)

  const { data, error } = await supabase
    .from('invoices')
    .insert(stamped)
    .select(INVOICE_SELECT)
    .single()

  if (error) throw error

  return mapInvoice(data)
}

export async function updateInvoice(invoiceId, updates) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const write = await resolveWriteCompany()
  const payload = {
    contract_id: updates.contract_id,
    due_date: updates.due_date,
    subtotal_amount: Number(updates.subtotal_amount),
    vat_applicable: Boolean(updates.vat_applicable),
    total_amount: Number(updates.total_amount),
  }
  delete payload.company_id

  if (payload.contract_id) {
    await assertParentInWriteCompany('contracts', payload.contract_id, write.companyId, 'contract')
  }

  let updQ = supabase
    .from('invoices')
    .update(payload)
    .eq('id', invoiceId)
    .eq('is_deleted', false)
  updQ = withWriteCompanyEq(updQ, write)
  const { data, error } = await updQ.select(INVOICE_SELECT).single()

  if (error) throw error

  return mapInvoice(data)
}

export async function softDeleteInvoice(invoiceId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const write = await resolveWriteCompany()
  let delQ = supabase.from('invoices').update({ is_deleted: true }).eq('id', invoiceId)
  delQ = withWriteCompanyEq(delQ, write)
  const { data, error } = await delQ.select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Invoice not found or out of company scope.')
}
