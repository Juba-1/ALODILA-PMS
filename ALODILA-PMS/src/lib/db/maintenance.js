import { supabase } from '../supabase/client'

export const MAINTENANCE_STATUSES = ['مفتوح', 'قيد المعالجة', 'مكتمل']

export function maintenanceStatusBadgeClass(status) {
  if (status === 'مفتوح') return 'bg-sky-50 text-sky-800 ring-sky-200'
  if (status === 'قيد المعالجة') return 'bg-amber-50 text-amber-900 ring-amber-200'
  if (status === 'مكتمل') return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

export async function getRequests() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('maintenance_requests')
    .select(
      `
      id,
      created_at,
      updated_at,
      unit_id,
      description,
      cost_amount,
      status,
      unit:units(
        id,
        unit_name,
        property_id,
        property:properties(id, name, category)
      )
    `,
    )
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map((r) => ({
    ...r,
    unit_name: r?.unit?.unit_name || '',
    property_name: r?.unit?.property?.name || '',
    property_id: r?.unit?.property_id || r?.unit?.property?.id || '',
    property_category: r?.unit?.property?.category || '',
  }))
}

export async function createRequest(input) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const description = String(input.description || '').trim()
  if (!input.unit_id) throw new Error('unit_id is required')
  if (!description) throw new Error('description is required')

  const cost = Number(input.cost_amount ?? 0)
  if (!Number.isFinite(cost) || cost < 0) throw new Error('cost_amount must be a valid non-negative number')

  const status = String(input.status || 'مفتوح')
  if (!MAINTENANCE_STATUSES.includes(status)) throw new Error('Invalid maintenance status')

  const payload = {
    unit_id: input.unit_id,
    description,
    cost_amount: cost,
    status,
    is_deleted: false,
  }

  const { data, error } = await supabase
    .from('maintenance_requests')
    .insert(payload)
    .select(
      `
      id,
      created_at,
      updated_at,
      unit_id,
      description,
      cost_amount,
      status,
      unit:units(
        id,
        unit_name,
        property_id,
        property:properties(id, name, category)
      )
    `,
    )
    .single()

  if (error) throw error

  return {
    ...data,
    unit_name: data?.unit?.unit_name || '',
    property_name: data?.unit?.property?.name || '',
    property_id: data?.unit?.property_id || data?.unit?.property?.id || '',
    property_category: data?.unit?.property?.category || '',
  }
}

export async function updateRequest(requestId, updates) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const description = String(updates.description || '').trim()
  if (!updates.unit_id) throw new Error('unit_id is required')
  if (!description) throw new Error('description is required')

  const cost = Number(updates.cost_amount ?? 0)
  if (!Number.isFinite(cost) || cost < 0) throw new Error('cost_amount must be a valid non-negative number')

  const status = String(updates.status || 'مفتوح')
  if (!MAINTENANCE_STATUSES.includes(status)) throw new Error('Invalid maintenance status')

  const payload = {
    unit_id: updates.unit_id,
    description,
    cost_amount: cost,
    status,
  }

  const { data, error } = await supabase
    .from('maintenance_requests')
    .update(payload)
    .eq('id', requestId)
    .eq('is_deleted', false)
    .select(
      `
      id,
      created_at,
      updated_at,
      unit_id,
      description,
      cost_amount,
      status,
      unit:units(
        id,
        unit_name,
        property_id,
        property:properties(id, name, category)
      )
    `,
    )
    .single()

  if (error) throw error

  return {
    ...data,
    unit_name: data?.unit?.unit_name || '',
    property_name: data?.unit?.property?.name || '',
    property_id: data?.unit?.property_id || data?.unit?.property?.id || '',
    property_category: data?.unit?.property?.category || '',
  }
}

export async function softDeleteRequest(requestId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { error } = await supabase.from('maintenance_requests').update({ is_deleted: true }).eq('id', requestId)
  if (error) throw error
}
