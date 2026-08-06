import { supabase } from '../supabase/client'
import { resolveReadScope, withCompanyEq } from '../tenancy/index.js'

export async function getReportingPayments() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const scope = await resolveReadScope()
  let q = supabase
    .from('payments')
    .select(
      `
      id,
      amount,
      payment_date,
      invoice:invoices(
        id,
        is_deleted,
        contract:contracts(
          id,
          is_deleted,
          unit:units(
            id,
            is_deleted,
            property_id,
            property:properties(id, name, category, is_deleted)
          )
        )
      )
    `,
    )
    .eq('is_deleted', false)
  q = withCompanyEq(q, scope)

  const { data, error } = await q

  if (error) throw error

  const rows = []
  for (const p of data || []) {
    const inv = p?.invoice
    if (!inv || inv.is_deleted) continue
    const con = inv?.contract
    if (!con || con.is_deleted) continue
    const unit = con?.unit
    if (!unit || unit.is_deleted) continue
    const prop = unit?.property
    if (!prop || prop.is_deleted) continue

    rows.push({
      id: p.id,
      payment_date: p.payment_date,
      amount: Number(p.amount || 0),
      property_id: prop.id,
      property_name: prop.name || '',
      property_category: prop.category || '',
    })
  }

  return rows
}

export async function getReportingMaintenance() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const scope = await resolveReadScope()
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
        is_deleted,
        property_id,
        property:properties(id, name, category, is_deleted)
      )
    `,
    )
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
  q = withCompanyEq(q, scope)

  const { data, error } = await q

  if (error) throw error

  const rows = []
  for (const m of data || []) {
    const unit = m?.unit
    if (!unit || unit.is_deleted) continue
    const prop = unit?.property
    if (!prop || prop.is_deleted) continue

    rows.push({
      id: m.id,
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
 * Active (ساري) leases with tenant, unit, property, and unit target rent — for dashboards / AI context.
 * @param {number} [limit]
 */
export async function getReportingActiveLeases(limit = 80) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const cap = Math.min(Math.max(Number(limit) || 80, 1), 150)

  const scope = await resolveReadScope()
  let q = supabase
    .from('contracts')
    .select(
      `
      id,
      tenant:tenants(full_name, is_deleted),
      unit:units(
        id,
        unit_name,
        target_rent_value,
        is_deleted,
        property:properties(id, name, is_deleted)
      )
    `,
    )
    .eq('is_deleted', false)
    .eq('status', 'ساري')
    .order('end_date', { ascending: true })
    .limit(cap)
  q = withCompanyEq(q, scope)

  const { data, error } = await q

  if (error) throw error

  const out = []
  for (const c of data || []) {
    const t = c?.tenant
    const u = c?.unit
    const p = u?.property
    if (!t || t.is_deleted) continue
    if (!u || u.is_deleted || !p || p.is_deleted) continue
    out.push({
      contract_id: c.id,
      tenant_full_name: t.full_name || '',
      unit_name: u.unit_name || '',
      property_name: p.name || '',
      monthly_rent_sar: Number(u.target_rent_value || 0),
    })
  }
  return out
}
