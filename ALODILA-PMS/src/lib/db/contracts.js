import { supabase } from '../supabase/client'

const UTILITY_TYPES = ['مستقل', 'مشترك', 'شامل', 'مقطوع']

function normalizeContractUtilityFields(input) {
  const raw = String(input?.utility_payment_type || 'مستقل').trim()
  const utility_payment_type = UTILITY_TYPES.includes(raw) ? raw : 'مستقل'
  let utility_flat_amount_sar = null
  if (utility_payment_type === 'مقطوع') {
    const n = Number(input?.utility_flat_amount_sar)
    utility_flat_amount_sar = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
  }
  const hn = input?.handover_notes != null ? String(input.handover_notes).trim() : ''
  const handover_notes = hn.length ? hn : null
  return { utility_payment_type, utility_flat_amount_sar, handover_notes }
}

const CONTRACT_SELECT = `
      id,
      unit_id,
      tenant_id,
      ejar_contract_number,
      start_date,
      end_date,
      actual_handover_date,
      contract_value,
      deposit,
      billing_cycle,
      status,
      utility_payment_type,
      utility_flat_amount_sar,
      handover_notes,
      tenant:tenants(id, full_name, is_deleted),
      unit:units(
        id,
        unit_name,
        is_deleted,
        property_id,
        property:properties(id, name)
      )
    `

function mapContractRow(c) {
  return {
    ...c,
    tenant_full_name: c?.tenant?.full_name || '',
    unit_name: c?.unit?.unit_name || '',
    property_id: c?.unit?.property_id || c?.unit?.property?.id || '',
    property_name: c?.unit?.property?.name || '',
  }
}

async function refreshUnitOccupancyFromContracts(unitId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!unitId) return

  const { data: unitRow, error: unitErr } = await supabase
    .from('units')
    .select('id,status')
    .eq('id', unitId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (unitErr) throw unitErr
  if (!unitRow?.id) return

  const currentStatus = String(unitRow.status || '')

  const { data: activeRows, error: activeErr } = await supabase
    .from('contracts')
    .select('id')
    .eq('is_deleted', false)
    .eq('unit_id', unitId)
    .eq('status', 'ساري')

  if (activeErr) throw activeErr

  const activeRentals = (activeRows || []).length
  const nextStatus = activeRentals > 0 ? 'مؤجرة' : currentStatus === 'مؤجرة' ? 'شاغرة' : currentStatus

  if (nextStatus === currentStatus) return

  const { error: updErr } = await supabase.from('units').update({ status: nextStatus }).eq('id', unitId).eq('is_deleted', false)
  if (updErr) throw updErr
}

export async function getContracts() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_SELECT)
    .eq('is_deleted', false)
    .order('start_date', { ascending: false })

  if (error) throw error

  return (data || [])
    .filter((c) => c?.tenant && c?.unit && c.tenant.is_deleted !== true && c.unit.is_deleted !== true)
    .map(mapContractRow)
}

export async function getActiveContractsForSelect() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data, error } = await supabase
    .from('contracts')
    .select(
      `
      id,
      ejar_contract_number,
      start_date,
      end_date,
      contract_value,
      billing_cycle,
      utility_payment_type,
      utility_flat_amount_sar,
      tenant:tenants(id, full_name, is_deleted),
      unit:units(
        id,
        unit_name,
        is_deleted,
        property_id,
        property:properties(id, name)
      )
    `,
    )
    .eq('is_deleted', false)
    .eq('status', 'ساري')
    .order('start_date', { ascending: false })

  if (error) throw error
  return (data || [])
    .filter((c) => c?.tenant && c?.unit && c.tenant.is_deleted !== true && c.unit.is_deleted !== true)
    .map((c) => ({
      id: c.id,
      ejar_contract_number: c.ejar_contract_number || null,
      start_date: c.start_date,
      end_date: c.end_date,
      contract_value: c.contract_value,
      billing_cycle: c.billing_cycle || 'شهري',
      utility_payment_type: c.utility_payment_type || 'مستقل',
      utility_flat_amount_sar: c.utility_flat_amount_sar ?? null,
      tenant_full_name: c?.tenant?.full_name || '',
      unit_name: c?.unit?.unit_name || '',
      property_id: c?.unit?.property_id || c?.unit?.property?.id || '',
      property_name: c?.unit?.property?.name || '',
    }))
}

export async function createContract(input) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const util = normalizeContractUtilityFields(input)
  const payload = {
    tenant_id: input.tenant_id,
    unit_id: input.unit_id,
    ejar_contract_number: input.ejar_contract_number ? String(input.ejar_contract_number).trim() : null,
    start_date: input.start_date,
    end_date: input.end_date,
    actual_handover_date: input.actual_handover_date || null,
    contract_value: Number(input.contract_value),
    deposit: Number(input.deposit ?? 0),
    billing_cycle: input.billing_cycle,
    status: input.status,
    utility_payment_type: util.utility_payment_type,
    utility_flat_amount_sar: util.utility_flat_amount_sar,
    handover_notes: util.handover_notes,
    is_deleted: false,
  }

  const { data, error } = await supabase
    .from('contracts')
    .insert(payload)
    .select(CONTRACT_SELECT)
    .single()

  if (error) throw error

  try {
    await refreshUnitOccupancyFromContracts(payload.unit_id)
  } catch (e) {
    // Best-effort consistency repair: if occupancy sync fails, hide the orphan contract row from the UI layer.
    try {
      await supabase.from('contracts').update({ is_deleted: true }).eq('id', data.id)
    } catch {
      // ignore
    }
    throw e
  }

  return mapContractRow(data)
}

export async function updateContract(contractId, updates) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data: before, error: beforeErr } = await supabase
    .from('contracts')
    .select('id,unit_id')
    .eq('id', contractId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (beforeErr) throw beforeErr
  if (!before?.id) throw new Error('Contract not found')

  const util = normalizeContractUtilityFields(updates)
  const payload = {
    tenant_id: updates.tenant_id,
    unit_id: updates.unit_id,
    ejar_contract_number: updates.ejar_contract_number ? String(updates.ejar_contract_number).trim() : null,
    start_date: updates.start_date,
    end_date: updates.end_date,
    actual_handover_date: updates.actual_handover_date || null,
    contract_value: Number(updates.contract_value),
    deposit: Number(updates.deposit ?? 0),
    billing_cycle: updates.billing_cycle,
    status: updates.status,
    utility_payment_type: util.utility_payment_type,
    utility_flat_amount_sar: util.utility_flat_amount_sar,
    handover_notes: util.handover_notes,
  }

  const { data, error } = await supabase
    .from('contracts')
    .update(payload)
    .eq('id', contractId)
    .eq('is_deleted', false)
    .select(CONTRACT_SELECT)
    .single()

  if (error) throw error

  const prevUnitId = before.unit_id
  const nextUnitId = payload.unit_id

  await refreshUnitOccupancyFromContracts(nextUnitId)
  if (prevUnitId && prevUnitId !== nextUnitId) await refreshUnitOccupancyFromContracts(prevUnitId)

  return mapContractRow(data)
}

export async function softDeleteContract(contractId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data: row, error: rowErr } = await supabase
    .from('contracts')
    .select('unit_id')
    .eq('id', contractId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (rowErr) throw rowErr

  const { error } = await supabase.from('contracts').update({ is_deleted: true }).eq('id', contractId)
  if (error) throw error

  if (row?.unit_id) await refreshUnitOccupancyFromContracts(row.unit_id)
}

