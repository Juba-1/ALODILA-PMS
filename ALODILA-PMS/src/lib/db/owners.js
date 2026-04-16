import { supabase } from '../supabase/client'

/**
 * Anonymous-safe: SECURITY DEFINER RPC `owner_lookup_for_onboarding` (see schema_owner_onboarding.sql).
 * Returns owners.id or null.
 */
export async function ownerLookupForOnboarding(nationalId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const nid = String(nationalId || '').trim()
  if (!nid) return null

  const { data, error } = await supabase.rpc('owner_lookup_for_onboarding', { p_national_id: nid })
  if (error) throw error
  if (data == null || data === '') return null
  return String(data)
}

export async function getOwners() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('owners')
    .select('id,full_name,national_id,phone,created_at,updated_at')
    .eq('is_deleted', false)
    .order('full_name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getOwnerById(ownerId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('owners')
    .select('id,full_name,national_id,phone,created_at,updated_at')
    .eq('id', ownerId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function createOwner(input) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = {
    full_name: String(input.full_name || '').trim(),
    national_id: String(input.national_id || '').trim(),
    phone: String(input.phone || '').trim(),
    is_deleted: false,
  }

  if (!payload.full_name) throw new Error('full_name is required')
  if (!payload.national_id) throw new Error('national_id is required')
  if (!payload.phone) throw new Error('phone is required')

  const { data, error } = await supabase
    .from('owners')
    .insert(payload)
    .select('id,full_name,national_id,phone,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

export async function updateOwner(ownerId, updates) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = {}
  if ('full_name' in (updates || {})) payload.full_name = String(updates.full_name || '').trim()
  if ('national_id' in (updates || {})) payload.national_id = String(updates.national_id || '').trim()
  if ('phone' in (updates || {})) payload.phone = String(updates.phone || '').trim()

  const { data, error } = await supabase
    .from('owners')
    .update(payload)
    .eq('id', ownerId)
    .eq('is_deleted', false)
    .select('id,full_name,national_id,phone,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

export async function softDeleteOwner(ownerId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { count, error: cErr } = await supabase
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('owner_crm_id', ownerId)
  if (cErr) throw cErr
  if ((count || 0) > 0) {
    throw new Error('لا يمكن إخفاء المالك: يوجد عقار مرتبط به. غيّر مالك العقار أولاً ثم حاول مرة أخرى.')
  }

  const { error } = await supabase.from('owners').update({ is_deleted: true }).eq('id', ownerId)
  if (error) throw error
}
