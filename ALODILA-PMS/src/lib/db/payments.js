import { supabase } from '../supabase/client'
import {
  resolveWriteCompany,
  stampInsert,
  assertParentInWriteCompany,
  resolveReadScope,
  withCompanyEq,
  withWriteCompanyEq,
} from '../tenancy/index.js'

export async function getPaymentsByInvoiceId(invoiceId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const scope = await resolveReadScope()
  let q = supabase
    .from('payments')
    .select('id,invoice_id,payment_date,amount,created_at,updated_at,company_id')
    .eq('invoice_id', invoiceId)
    .eq('is_deleted', false)
    .order('payment_date', { ascending: false })
  q = withCompanyEq(q, scope)
  const { data, error } = await q

  if (error) throw error
  return data || []
}

export async function createPayment(input) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = {
    invoice_id: input.invoice_id,
    payment_date: input.payment_date,
    amount: Number(input.amount),
    is_deleted: false,
  }

  const write = await resolveWriteCompany()
  await assertParentInWriteCompany('invoices', payload.invoice_id, write.companyId, 'invoice')
  const stamped = stampInsert(payload, write)

  const { data, error } = await supabase
    .from('payments')
    .insert(stamped)
    .select('id,invoice_id,payment_date,amount,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updatePayment(paymentId, updates) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const write = await resolveWriteCompany()
  const payload = {
    payment_date: updates.payment_date,
    amount: Number(updates.amount),
  }
  delete payload.company_id

  let updQ = supabase
    .from('payments')
    .update(payload)
    .eq('id', paymentId)
    .eq('is_deleted', false)
  updQ = withWriteCompanyEq(updQ, write)
  const { data, error } = await updQ
    .select('id,invoice_id,payment_date,amount,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

export async function softDeletePayment(paymentId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const write = await resolveWriteCompany()
  let delQ = supabase.from('payments').update({ is_deleted: true }).eq('id', paymentId)
  delQ = withWriteCompanyEq(delQ, write)
  const { data, error } = await delQ.select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Payment not found or out of company scope.')
}
