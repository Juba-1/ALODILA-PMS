import { supabase } from '../supabase/client'

export async function getPaymentsByInvoiceId(invoiceId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('payments')
    .select('id,invoice_id,payment_date,amount,created_at,updated_at')
    .eq('invoice_id', invoiceId)
    .eq('is_deleted', false)
    .order('payment_date', { ascending: false })

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

  const { data, error } = await supabase
    .from('payments')
    .insert(payload)
    .select('id,invoice_id,payment_date,amount,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updatePayment(paymentId, updates) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = {
    payment_date: updates.payment_date,
    amount: Number(updates.amount),
  }

  const { data, error } = await supabase
    .from('payments')
    .update(payload)
    .eq('id', paymentId)
    .eq('is_deleted', false)
    .select('id,invoice_id,payment_date,amount,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

export async function softDeletePayment(paymentId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { error } = await supabase.from('payments').update({ is_deleted: true }).eq('id', paymentId)
  if (error) throw error
}

