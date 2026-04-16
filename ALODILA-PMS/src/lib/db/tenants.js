import { supabase } from '../supabase/client'

export async function getTenants() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('tenants')
    .select('id,national_id_or_cr,full_name,tenant_type,phone,national_address,compliance_index,created_at,updated_at')
    .eq('is_deleted', false)
    .order('full_name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createTenant(input) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = {
    national_id_or_cr: String(input.national_id_or_cr || '').trim(),
    full_name: String(input.full_name || '').trim(),
    tenant_type: String(input.tenant_type || '').trim(),
    phone: String(input.phone || '').trim(),
    national_address: input.national_address ? String(input.national_address).trim() : null,
    compliance_index: 0,
    is_deleted: false,
  }

  const { data, error } = await supabase
    .from('tenants')
    .insert(payload)
    .select('id,national_id_or_cr,full_name,tenant_type,phone,national_address,compliance_index,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updateTenant(tenantId, updates) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = {}
  if ('national_id_or_cr' in (updates || {})) payload.national_id_or_cr = String(updates.national_id_or_cr || '').trim()
  if ('full_name' in (updates || {})) payload.full_name = String(updates.full_name || '').trim()
  if ('tenant_type' in (updates || {})) payload.tenant_type = String(updates.tenant_type || '').trim()
  if ('phone' in (updates || {})) payload.phone = String(updates.phone || '').trim()
  if ('national_address' in (updates || {})) payload.national_address = updates.national_address ? String(updates.national_address).trim() : null

  const { data, error } = await supabase
    .from('tenants')
    .update(payload)
    .eq('id', tenantId)
    .eq('is_deleted', false)
    .select('id,national_id_or_cr,full_name,tenant_type,phone,national_address,compliance_index,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

export async function softDeleteTenant(tenantId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { count, error: cErr } = await supabase
    .from('contracts')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('status', 'ساري')
    .eq('tenant_id', tenantId)
  if (cErr) throw cErr
  if ((count || 0) > 0) {
    throw new Error('لا يمكن إخفاء المستأجر: يوجد عقد ساري باسمه. أنهِ العقد أو غيّر الحالة أولاً.')
  }

  const { error } = await supabase.from('tenants').update({ is_deleted: true }).eq('id', tenantId)
  if (error) throw error
}

