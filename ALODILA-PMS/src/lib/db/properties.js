import { supabase } from '../supabase/client'

/** Normalize CRM owner UUID for insert/update (empty → null). */
function normalizeOwnerCrmId(value) {
  if (value == null) return null
  const s = String(value).trim()
  return s.length ? s : null
}

export async function getActiveProperties() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('properties')
    .select(
      'id,name,category,type,deed_number,maps_link,total_units_capacity,electricity_meter_count,water_meter_count,owner_crm_id,management_start_date,created_at,updated_at',
    )
    .eq('is_deleted', false)
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getPropertyById(propertyId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('properties')
    .select(
      'id,name,category,type,deed_number,maps_link,total_units_capacity,electricity_meter_count,water_meter_count,owner_crm_id,management_start_date,created_at,updated_at',
    )
    .eq('id', propertyId)
    .eq('is_deleted', false)
    .single()

  if (error) throw error
  return data
}

export async function createProperty({
  name,
  category,
  type,
  deed_number,
  maps_link,
  total_units_capacity,
  electricity_meter_count,
  water_meter_count,
  owner_crm_id,
  management_start_date,
}) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!user) throw new Error('Not authenticated.')

  const ec = Number(electricity_meter_count)
  const wc = Number(water_meter_count)
  const payload = {
    name: String(name).trim(),
    category: String(category).trim(),
    type,
    deed_number: deed_number ? String(deed_number).trim() : null,
    maps_link: maps_link ? String(maps_link).trim() : null,
    total_units_capacity: Number(total_units_capacity),
    electricity_meter_count: Number.isFinite(ec) && ec >= 0 ? Math.floor(ec) : 0,
    water_meter_count: Number.isFinite(wc) && wc >= 0 ? Math.floor(wc) : 0,
    owner_id: user.id,
    owner_crm_id: normalizeOwnerCrmId(owner_crm_id),
    management_start_date: management_start_date || null,
    is_deleted: false,
  }

  const { data, error } = await supabase
    .from('properties')
    .insert(payload)
    .select(
      'id,name,category,type,deed_number,maps_link,total_units_capacity,electricity_meter_count,water_meter_count,owner_crm_id,management_start_date,created_at,updated_at',
    )
    .single()

  if (error) throw error
  return data
}

export async function updateProperty(propertyId, updates) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = {}

  if (typeof updates?.name === 'string') payload.name = updates.name.trim()
  if (typeof updates?.category === 'string') payload.category = updates.category.trim()
  if (typeof updates?.type === 'string') payload.type = updates.type
  if ('deed_number' in (updates || {})) payload.deed_number = updates.deed_number ? String(updates.deed_number).trim() : null
  if ('maps_link' in (updates || {})) payload.maps_link = updates.maps_link ? String(updates.maps_link).trim() : null
  if ('total_units_capacity' in (updates || {})) payload.total_units_capacity = Number(updates.total_units_capacity)
  if ('owner_crm_id' in (updates || {})) payload.owner_crm_id = normalizeOwnerCrmId(updates.owner_crm_id)
  if ('management_start_date' in (updates || {})) payload.management_start_date = updates.management_start_date || null
  if ('electricity_meter_count' in (updates || {})) {
    const n = Number(updates.electricity_meter_count)
    payload.electricity_meter_count = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }
  if ('water_meter_count' in (updates || {})) {
    const n = Number(updates.water_meter_count)
    payload.water_meter_count = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }

  const { data, error } = await supabase
    .from('properties')
    .update(payload)
    .eq('id', propertyId)
    .eq('is_deleted', false)
    .select(
      'id,name,category,type,deed_number,maps_link,total_units_capacity,electricity_meter_count,water_meter_count,owner_crm_id,management_start_date,created_at,updated_at',
    )
    .single()

  if (error) throw error
  return data
}

async function countActiveContractsOnProperty(propertyId) {
  const { data: units, error: uErr } = await supabase
    .from('units')
    .select('id')
    .eq('property_id', propertyId)
    .eq('is_deleted', false)
  if (uErr) throw uErr
  const unitIds = (units || []).map((u) => u.id).filter(Boolean)
  if (!unitIds.length) return 0

  const { count, error } = await supabase
    .from('contracts')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('status', 'ساري')
    .in('unit_id', unitIds)

  if (error) throw error
  return count || 0
}

export async function softDeleteProperty(propertyId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const active = await countActiveContractsOnProperty(propertyId)
  if (active > 0) {
    throw new Error(
      'لا يمكن إخفاء العقار: توجد عقود نشطة (ساري) على وحداته. أنهِ العقود أو غيّر حالتها ثم حاول مرة أخرى.',
    )
  }

  const { data, error } = await supabase
    .from('properties')
    .update({ is_deleted: true })
    .eq('id', propertyId)
    .select('id')

  if (error) throw error
  return data?.[0]?.id
}

