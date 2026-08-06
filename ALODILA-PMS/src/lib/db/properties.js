import { supabase } from '../supabase/client'
import { naturalCompare } from '../sort/naturalCompare'
import {
  resolveWriteCompany,
  stampInsert,
  assertParentInWriteCompany,
  resolveReadScope,
  withCompanyEq,
  withWriteCompanyEq,
  assertRowInScope,
} from '../tenancy/index.js'

const PROPERTY_COLS =
  'id,name,category,type,deed_number,maps_link,total_units_capacity,electricity_meter_count,water_meter_count,owner_crm_id,management_start_date,assigned_manager,company_id,created_at,updated_at'

/** Normalize CRM owner UUID for insert/update (empty → null). */
function normalizeOwnerCrmId(value) {
  if (value == null) return null
  const s = String(value).trim()
  return s.length ? s : null
}

/** Normalize free-text manager name (empty → null, trimmed). */
function normalizeAssignedManager(value) {
  if (value == null) return null
  const s = String(value).trim()
  return s.length ? s : null
}

export async function getActiveProperties() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const scope = await resolveReadScope()
  let q = supabase.from('properties').select(PROPERTY_COLS).eq('is_deleted', false)
  q = withCompanyEq(q, scope)
  const { data, error } = await q

  if (error) throw error
  return (data || []).slice().sort((a, b) => naturalCompare(a?.name, b?.name))
}

export async function getPropertyById(propertyId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const scope = await resolveReadScope()
  let q = supabase
    .from('properties')
    .select(PROPERTY_COLS)
    .eq('id', propertyId)
    .eq('is_deleted', false)
  q = withCompanyEq(q, scope)
  const { data, error } = await q.maybeSingle()

  if (error) throw error
  if (data) assertRowInScope(data, scope)
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
  assigned_manager,
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
    assigned_manager: normalizeAssignedManager(assigned_manager),
    is_deleted: false,
  }

  const write = await resolveWriteCompany()
  if (payload.owner_crm_id) {
    await assertParentInWriteCompany('owners', payload.owner_crm_id, write.companyId, 'owner')
  }
  const stamped = stampInsert(payload, write)

  const { data, error } = await supabase
    .from('properties')
    .insert(stamped)
    .select(PROPERTY_COLS)
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
  if ('assigned_manager' in (updates || {})) payload.assigned_manager = normalizeAssignedManager(updates.assigned_manager)
  if ('electricity_meter_count' in (updates || {})) {
    const n = Number(updates.electricity_meter_count)
    payload.electricity_meter_count = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }
  if ('water_meter_count' in (updates || {})) {
    const n = Number(updates.water_meter_count)
    payload.water_meter_count = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }
  delete payload.company_id

  const write = await resolveWriteCompany()
  if (payload.owner_crm_id) {
    await assertParentInWriteCompany('owners', payload.owner_crm_id, write.companyId, 'owner')
  }
  let q = supabase.from('properties').update(payload).eq('id', propertyId).eq('is_deleted', false)
  q = withWriteCompanyEq(q, write)
  const { data, error } = await q.select(PROPERTY_COLS).maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Property not found or out of company scope.')
  return data
}

async function countActiveContractsOnProperty(propertyId) {
  const scope = await resolveReadScope()

  let unitsQ = supabase
    .from('units')
    .select('id')
    .eq('property_id', propertyId)
    .eq('is_deleted', false)
  unitsQ = withCompanyEq(unitsQ, scope)
  const { data: units, error: uErr } = await unitsQ
  if (uErr) throw uErr
  const unitIds = (units || []).map((u) => u.id).filter(Boolean)
  if (!unitIds.length) return 0

  let contractsQ = supabase
    .from('contracts')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('status', 'ساري')
    .in('unit_id', unitIds)
  contractsQ = withCompanyEq(contractsQ, scope)
  const { count, error } = await contractsQ

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

  const write = await resolveWriteCompany()
  let delQ = supabase.from('properties').update({ is_deleted: true }).eq('id', propertyId)
  delQ = withWriteCompanyEq(delQ, write)
  const { data, error } = await delQ.select('id').maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Property not found or out of company scope.')
  return data.id
}
