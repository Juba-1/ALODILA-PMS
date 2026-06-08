import { supabase } from '../supabase/client'
import { deletePendingInvoicesForContract } from './contractFinance'

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeSecondaryUnitIds(input, mainUnitId) {
  const raw = Array.isArray(input?.secondary_unit_ids) ? input.secondary_unit_ids : []
  const main = mainUnitId ? String(mainUnitId) : ''
  const seen = new Set()
  const ids = []
  for (const id of raw) {
    const s = String(id || '').trim()
    if (!UUID_RE.test(s) || s === main || seen.has(s)) continue
    seen.add(s)
    ids.push(s)
  }
  return ids
}

function collectContractUnitIds(contractRow) {
  const ids = []
  if (contractRow?.unit_id) ids.push(contractRow.unit_id)
  for (const id of normalizeSecondaryUnitIds(contractRow, contractRow?.unit_id)) ids.push(id)
  return [...new Set(ids)]
}

const CONTRACT_SELECT = `
      id,
      unit_id,
      secondary_unit_ids,
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
    .select('id, unit_id, secondary_unit_ids')
    .eq('is_deleted', false)
    .eq('status', 'ساري')

  if (activeErr) throw activeErr

  const uid = String(unitId)
  const activeRentals = (activeRows || []).filter((c) => {
    if (String(c?.unit_id || '') === uid) return true
    const secondary = normalizeSecondaryUnitIds(c, c?.unit_id)
    return secondary.includes(uid)
  }).length
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
  const secondary_unit_ids = normalizeSecondaryUnitIds(input, input.unit_id)
  const payload = {
    tenant_id: input.tenant_id,
    unit_id: input.unit_id,
    secondary_unit_ids,
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
    for (const uid of collectContractUnitIds({ unit_id: payload.unit_id, secondary_unit_ids })) {
      await refreshUnitOccupancyFromContracts(uid)
    }
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
    .select('id, unit_id, secondary_unit_ids')
    .eq('id', contractId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (beforeErr) throw beforeErr
  if (!before?.id) throw new Error('Contract not found')

  const util = normalizeContractUtilityFields(updates)
  const secondary_unit_ids = normalizeSecondaryUnitIds(updates, updates.unit_id)
  const payload = {
    tenant_id: updates.tenant_id,
    unit_id: updates.unit_id,
    secondary_unit_ids,
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

  const unitsToRefresh = new Set([
    ...collectContractUnitIds(before),
    ...collectContractUnitIds({ unit_id: payload.unit_id, secondary_unit_ids }),
  ])
  for (const uid of unitsToRefresh) {
    await refreshUnitOccupancyFromContracts(uid)
  }

  return mapContractRow(data)
}

/**
 * Early termination with settlement: mark contract ended, free all linked units,
 * and clear unrealized pending invoices.
 */
export async function terminateContractAndSettle(contractId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data: before, error: beforeErr } = await supabase
    .from('contracts')
    .select('id, unit_id, secondary_unit_ids, status')
    .eq('id', contractId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (beforeErr) throw beforeErr
  if (!before?.id) throw new Error('Contract not found')
  if (before.status === 'منتهي') throw new Error('العقد منتهٍ مسبقاً.')

  const { data, error } = await supabase
    .from('contracts')
    .update({ status: 'منتهي' })
    .eq('id', contractId)
    .eq('is_deleted', false)
    .select(CONTRACT_SELECT)
    .single()

  if (error) throw error

  await deletePendingInvoicesForContract(contractId)

  for (const uid of collectContractUnitIds(before)) {
    await refreshUnitOccupancyFromContracts(uid)
  }

  return mapContractRow(data)
}

export async function softDeleteContract(contractId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const { data: row, error: rowErr } = await supabase
    .from('contracts')
    .select('unit_id, secondary_unit_ids')
    .eq('id', contractId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (rowErr) throw rowErr

  const { error } = await supabase.from('contracts').update({ is_deleted: true }).eq('id', contractId)
  if (error) throw error

  for (const uid of collectContractUnitIds(row || {})) {
    await refreshUnitOccupancyFromContracts(uid)
  }
}

