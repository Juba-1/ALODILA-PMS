import { supabase } from '../supabase/client'

export async function getActiveUnitsByPropertyId(propertyId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('units')
    .select('id,unit_name,type,target_rent_value,rooms_count,status,electricity_meter_ref,water_meter_ref,created_at,updated_at')
    .eq('property_id', propertyId)
    .eq('is_deleted', false)
    .order('unit_name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getActiveUnits() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('units')
    .select(
      `
      id,
      unit_name,
      type,
      target_rent_value,
      rooms_count,
      status,
      electricity_meter_ref,
      water_meter_ref,
      property_id,
      property:properties(id, name)
    `,
    )
    .eq('is_deleted', false)
    .order('unit_name', { ascending: true })

  if (error) throw error
  return (data || []).map((u) => ({
    ...u,
    property_name: u?.property?.name || '',
  }))
}

export async function getUnitsInventory() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('units')
    .select(
      `
      id,
      unit_name,
      type,
      rooms_count,
      status,
      target_rent_value,
      electricity_meter_ref,
      water_meter_ref,
      property:properties(id, name, category),
      property_id
    `,
    )
    .eq('is_deleted', false)
    .order('unit_name', { ascending: true })

  if (error) throw error
  return (data || []).map((u) => ({
    ...u,
    property_name: u?.property?.name || '',
    property_category: u?.property?.category || '',
  }))
}

export async function bulkCreateUnits(units) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = (units || []).map((u) => {
    const rc = Number(u.rooms_count)
    const rooms = Number.isFinite(rc) && rc > 0 ? Math.floor(rc) : 1
    return {
      property_id: u.property_id,
      unit_name: String(u.unit_name).trim(),
      type: u.type,
      target_rent_value: Number(u.target_rent_value),
      rooms_count: rooms,
      status: typeof u.status === 'string' && u.status ? u.status : 'شاغرة',
      electricity_meter_ref: u.electricity_meter_ref != null && String(u.electricity_meter_ref).trim() ? String(u.electricity_meter_ref).trim() : null,
      water_meter_ref: u.water_meter_ref != null && String(u.water_meter_ref).trim() ? String(u.water_meter_ref).trim() : null,
      is_deleted: false,
    }
  })

  const { data, error } = await supabase
    .from('units')
    .insert(payload)
    .select('id,unit_name,type,target_rent_value,rooms_count,status,electricity_meter_ref,water_meter_ref')
  if (error) throw error
  return data || []
}

export async function softDeleteUnit(unitId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { count, error: cErr } = await supabase
    .from('contracts')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('status', 'ساري')
    .eq('unit_id', unitId)
  if (cErr) throw cErr
  if ((count || 0) > 0) {
    throw new Error('لا يمكن إخفاء الوحدة: يوجد عقد ساري مرتبط بها. انقل المستأجر أو غيّر حالة العقد أولاً.')
  }

  const { error } = await supabase.from('units').update({ is_deleted: true }).eq('id', unitId)
  if (error) throw error
}

export async function updateUnit(unitId, updates) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const payload = {}
  if (typeof updates?.unit_name === 'string') payload.unit_name = updates.unit_name.trim()
  if (typeof updates?.type === 'string') payload.type = updates.type
  if ('target_rent_value' in (updates || {})) payload.target_rent_value = Number(updates.target_rent_value)
  if ('rooms_count' in (updates || {})) {
    const rc = Number(updates.rooms_count)
    payload.rooms_count = Number.isFinite(rc) && rc > 0 ? Math.floor(rc) : 1
  }
  if (typeof updates?.status === 'string') payload.status = updates.status
  if ('electricity_meter_ref' in (updates || {})) {
    const s = updates.electricity_meter_ref != null ? String(updates.electricity_meter_ref).trim() : ''
    payload.electricity_meter_ref = s.length ? s : null
  }
  if ('water_meter_ref' in (updates || {})) {
    const s = updates.water_meter_ref != null ? String(updates.water_meter_ref).trim() : ''
    payload.water_meter_ref = s.length ? s : null
  }

  const { data, error } = await supabase
    .from('units')
    .update(payload)
    .eq('id', unitId)
    .eq('is_deleted', false)
    .select('id,unit_name,type,target_rent_value,rooms_count,status,electricity_meter_ref,water_meter_ref,created_at,updated_at')
    .single()

  if (error) throw error
  return data
}

