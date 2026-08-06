import { assertOwnerCrmIdMatchesSession } from '../auth/ownerScope'
import { supabase } from '../supabase/client'
import { resolveReadScope, withCompanyEq, assertRowInScope } from '../tenancy/index.js'
import { getInvoicesForContractIds } from './invoices'
import { getActiveUnitsByPropertyId } from './units'

const CONTRACT_SELECT = `
      id,
      ejar_contract_number,
      start_date,
      end_date,
      contract_value,
      billing_cycle,
      status,
      tenant:tenants(id, full_name),
      unit:units(
        id,
        unit_name,
        target_rent_value,
        property_id,
        property:properties(id, name)
      )
    `

function mapContractRow(c) {
  const monthlyRent = Number(c?.unit?.target_rent_value ?? 0)
  return {
    id: c.id,
    ejar_contract_number: c.ejar_contract_number || null,
    start_date: c.start_date,
    end_date: c.end_date,
    contract_value: c.contract_value,
    billing_cycle: c.billing_cycle || '',
    status: c.status,
    tenant_full_name: c?.tenant?.full_name || '',
    unit_name: c?.unit?.unit_name || '',
    property_id: c?.unit?.property_id || c?.unit?.property?.id || '',
    property_name: c?.unit?.property?.name || '',
    /** Monthly rent target on the unit (SAR) — shown as «الإيجار» in owner UI */
    monthly_rent: monthlyRent,
    rent_amount: monthlyRent,
  }
}

/**
 * Graph: properties (owner_crm_id) → units → contracts → invoices → payments
 * All reads are scoped by owner CRM id; RLS must allow the same rows (see schema_owner_portal_rls.sql).
 * Isolation: `assertOwnerCrmIdMatchesSession` on entry points + RLS `current_owner_id()` = JWT owner_crm_id
 * (national ID is resolved to `owners.id` at signup only — not sent on each query).
 * Sprint 4 Stream C: company_id filter is additive via withCompanyEq.
 */
async function resolveOwnerScope(ownerCrmId, scope) {
  const readScope = scope ?? (await resolveReadScope())
  const properties = await getOwnerProperties(ownerCrmId, readScope)
  const propertyIds = properties.map((p) => p.id).filter(Boolean)
  if (!propertyIds.length) {
    return { properties, propertyIds, unitIds: [], contractRows: [], contractIds: [], scope: readScope }
  }

  let unitsQ = supabase
    .from('units')
    .select('id')
    .eq('is_deleted', false)
    .in('property_id', propertyIds)
  unitsQ = withCompanyEq(unitsQ, readScope)
  const { data: unitsRes, error: unitsErr } = await unitsQ

  if (unitsErr) throw unitsErr
  const unitIds = (unitsRes || []).map((u) => u.id).filter(Boolean)
  if (!unitIds.length) {
    return { properties, propertyIds, unitIds: [], contractRows: [], contractIds: [], scope: readScope }
  }

  let contractsQ = supabase
    .from('contracts')
    .select(
      `
      id,
      unit_id,
      unit:units(
        id,
        property_id,
        is_deleted,
        property:properties(id, name, category, is_deleted)
      )
    `,
    )
    .eq('is_deleted', false)
    .in('unit_id', unitIds)
  contractsQ = withCompanyEq(contractsQ, readScope)
  const { data: contractRows, error: cErr } = await contractsQ

  if (cErr) throw cErr

  const rows = (contractRows || []).filter((row) => {
    const u = row?.unit
    const p = u?.property
    return u && !u.is_deleted && p && !p.is_deleted
  })

  const contractIds = rows.map((r) => r.id).filter(Boolean)
  return { properties, propertyIds, unitIds, contractRows: rows, contractIds, scope: readScope }
}

function contractIdToPropertyMeta(contractRows) {
  const map = new Map()
  for (const row of contractRows || []) {
    const u = row?.unit
    const p = u?.property
    if (!row?.id || !p?.id) continue
    map.set(row.id, {
      property_id: p.id,
      property_name: p.name || '',
      property_category: p.category || '',
    })
  }
  return map
}

export async function getOwnerProperties(ownerCrmId, scope) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!ownerCrmId) throw new Error('ownerCrmId is required')
  await assertOwnerCrmIdMatchesSession(ownerCrmId)

  const readScope = scope ?? (await resolveReadScope())
  let q = supabase
    .from('properties')
    .select(
      'id,name,category,type,deed_number,maps_link,total_units_capacity,management_start_date,created_at,owner_crm_id',
    )
    .eq('is_deleted', false)
    .eq('owner_crm_id', ownerCrmId)
    .order('name', { ascending: true })
  q = withCompanyEq(q, readScope)
  const { data, error } = await q

  if (error) throw error
  return data || []
}

export async function getOwnerPropertyById(ownerCrmId, propertyId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!ownerCrmId || !propertyId) throw new Error('ownerCrmId and propertyId are required')
  await assertOwnerCrmIdMatchesSession(ownerCrmId)

  const scope = await resolveReadScope()
  let q = supabase
    .from('properties')
    .select(
      'id,name,category,type,deed_number,maps_link,total_units_capacity,management_start_date,created_at,owner_crm_id,company_id',
    )
    .eq('id', propertyId)
    .eq('is_deleted', false)
    .eq('owner_crm_id', ownerCrmId)
  q = withCompanyEq(q, scope)
  const { data, error } = await q.maybeSingle()

  if (error) throw error
  if (data) assertRowInScope(data, scope)
  return data
}

/** Active contracts: unit on owner property, status ساري, not deleted. */
export async function getOwnerActiveContracts(ownerCrmId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!ownerCrmId) throw new Error('ownerCrmId is required')

  const scope = await resolveReadScope()
  const { unitIds } = await resolveOwnerScope(ownerCrmId, scope)
  if (!unitIds.length) return []

  let q = supabase
    .from('contracts')
    .select(CONTRACT_SELECT)
    .eq('is_deleted', false)
    .eq('status', 'ساري')
    .in('unit_id', unitIds)
    .order('end_date', { ascending: true })
  q = withCompanyEq(q, scope)
  const { data, error } = await q

  if (error) throw error
  return (data || []).map(mapContractRow)
}

/**
 * Occupancy: total units on owner properties; «rented» = units with at least one ساري contract
 * (falls back to unit.status === 'مؤجرة' when no contract row matches legacy data).
 */
export async function getOwnerUnitsSummary(ownerCrmId) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  if (!ownerCrmId) throw new Error('ownerCrmId is required')

  const scope = await resolveReadScope()
  const { propertyIds, unitIds } = await resolveOwnerScope(ownerCrmId, scope)
  if (!propertyIds.length) return { totalUnits: 0, rentedUnits: 0 }

  const totalUnits = unitIds.length
  let rentedUnits = 0
  if (unitIds.length) {
    let q = supabase
      .from('contracts')
      .select('unit_id')
      .eq('is_deleted', false)
      .eq('status', 'ساري')
      .in('unit_id', unitIds)
    q = withCompanyEq(q, scope)
    const { data: activeUnits, error: cuErr } = await q

    if (cuErr) throw cuErr
    rentedUnits = new Set((activeUnits || []).map((c) => c.unit_id).filter(Boolean)).size
  }

  return { totalUnits, rentedUnits }
}

async function fetchOwnerPaymentsGraph(contractIds, contractMetaById, scope) {
  if (!contractIds.length) return []

  const readScope = scope ?? (await resolveReadScope())
  let invQ = supabase
    .from('invoices')
    .select('id, contract_id')
    .eq('is_deleted', false)
    .in('contract_id', contractIds)
  invQ = withCompanyEq(invQ, readScope)
  const { data: invs, error: invErr } = await invQ

  if (invErr) throw invErr
  const invoiceRows = invs || []
  const invoiceIds = invoiceRows.map((i) => i.id).filter(Boolean)
  if (!invoiceIds.length) return []

  const invToContract = new Map(invoiceRows.map((i) => [i.id, i.contract_id]))

  let payQ = supabase
    .from('payments')
    .select('id, amount, payment_date, invoice_id')
    .eq('is_deleted', false)
    .in('invoice_id', invoiceIds)
  payQ = withCompanyEq(payQ, readScope)
  const { data, error } = await payQ

  if (error) throw error

  const out = []
  for (const p of data || []) {
    const cid = invToContract.get(p.invoice_id)
    const meta = cid ? contractMetaById.get(cid) : null
    if (!meta?.property_id) continue
    out.push({
      id: p.id,
      payment_date: p.payment_date,
      amount: Number(p.amount || 0),
      property_id: meta.property_id,
      property_name: meta.property_name,
      property_category: meta.property_category,
    })
  }
  return out
}

async function fetchOwnerMaintenanceGraph(unitIds, scope) {
  if (!unitIds.length) return []

  const readScope = scope ?? (await resolveReadScope())
  let q = supabase
    .from('maintenance_requests')
    .select(
      `
      id,
      created_at,
      cost_amount,
      status,
      description,
      unit:units(
        id,
        unit_name,
        is_deleted,
        property_id,
        property:properties(id, name, category, is_deleted)
      )
    `,
    )
    .eq('is_deleted', false)
    .in('unit_id', unitIds)
    .order('created_at', { ascending: false })
  q = withCompanyEq(q, readScope)
  const { data, error } = await q

  if (error) throw error

  const rows = []
  for (const m of data || []) {
    const unit = m?.unit
    const prop = unit?.property
    if (!unit || unit.is_deleted || !prop || prop.is_deleted) continue
    rows.push({
      id: m.id,
      unit_id: unit.id,
      unit_name: unit.unit_name || '',
      created_at: m.created_at,
      cost_amount: Number(m.cost_amount || 0),
      status: m.status,
      description: m.description,
      property_id: prop.id,
      property_name: prop.name || '',
      property_category: prop.category || '',
    })
  }
  return rows
}

/**
 * Work-order ledger for the owner portal: every maintenance line on the owner's units,
 * with unit context and the active leaseholder (when a ساري contract exists).
 */
export async function getOwnerMaintenanceLedger(ownerCrmId) {
  if (!ownerCrmId) throw new Error('ownerCrmId is required')

  const scope = await resolveReadScope()
  const { unitIds } = await resolveOwnerScope(ownerCrmId, scope)
  const base = await fetchOwnerMaintenanceGraph(unitIds, scope)
  if (!unitIds.length) return []

  let q = supabase
    .from('contracts')
    .select(
      `
      unit_id,
      tenant:tenants(full_name)
    `,
    )
    .eq('is_deleted', false)
    .eq('status', 'ساري')
    .in('unit_id', unitIds)
  q = withCompanyEq(q, scope)
  const { data: activeContracts, error } = await q

  if (error) throw error

  const tenantByUnit = new Map()
  for (const c of activeContracts || []) {
    const uid = c.unit_id
    if (!uid) continue
    if (!tenantByUnit.has(uid)) {
      tenantByUnit.set(uid, c?.tenant?.full_name || '')
    }
  }

  return base.map((row) => ({
    ...row,
    active_tenant_name: tenantByUnit.get(row.unit_id) || '',
  }))
}

function paymentsTotalThisCalendarMonth(payments, now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const prefix = `${y}-${m}`
  let sum = 0
  for (const p of payments || []) {
    if (String(p.payment_date || '').startsWith(prefix)) sum += Number(p.amount || 0)
  }
  return sum
}

/**
 * Payments, maintenance, invoices strictly under owner properties (graph walk).
 * Includes summary for dashboards / AI.
 */
export async function getOwnerReportingBundle(ownerCrmId) {
  if (!ownerCrmId) throw new Error('ownerCrmId is required')

  const scope = await resolveReadScope()
  const { properties, unitIds, contractIds, contractRows } = await resolveOwnerScope(ownerCrmId, scope)
  const contractMetaById = contractIdToPropertyMeta(contractRows)

  if (!contractIds.length) {
    return {
      properties,
      payments: [],
      maintenance: [],
      invoices: [],
      summary: {
        totalPaymentsCollected: 0,
        totalMaintenanceCost: 0,
        maintenanceRequestCount: 0,
        paymentsThisCalendarMonth: 0,
        calendarMonthKey: '',
        netCollectedMinusMaintenance: 0,
      },
    }
  }

  const [payments, maintenance, invoices] = await Promise.all([
    fetchOwnerPaymentsGraph(contractIds, contractMetaById, scope),
    fetchOwnerMaintenanceGraph(unitIds, scope),
    getInvoicesForContractIds(contractIds),
  ])

  const totalPaymentsCollected = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const totalMaintenanceCost = maintenance.reduce((s, m) => s + Number(m.cost_amount || 0), 0)
  const now = new Date()
  const calendarMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return {
    properties,
    payments,
    maintenance,
    invoices,
    summary: {
      totalPaymentsCollected,
      totalMaintenanceCost,
      maintenanceRequestCount: maintenance.length,
      paymentsThisCalendarMonth: paymentsTotalThisCalendarMonth(payments, now),
      calendarMonthKey,
      netCollectedMinusMaintenance: totalPaymentsCollected - totalMaintenanceCost,
    },
  }
}

export async function getOwnerPropertyUnits(ownerCrmId, propertyId) {
  const p = await getOwnerPropertyById(ownerCrmId, propertyId)
  if (!p) return []
  return getActiveUnitsByPropertyId(propertyId)
}
