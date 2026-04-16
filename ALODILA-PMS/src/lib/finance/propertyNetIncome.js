/**
 * Single source of truth for property-level net operating income shown to Admin and Owners.
 * Definition: sum(payment amounts attributed to property) − sum(maintenance cost_amount on units in property).
 * Uses the same attribution rules as `getReportingPayments` / owner graph (rows already scoped server-side).
 */

export function buildNetRoiRowsByProperty({ payments, maintenance, emptyProperties = [] }) {
  const revenue = new Map()
  const expense = new Map()
  const names = new Map()

  for (const p of payments || []) {
    if (!p.property_id) continue
    names.set(p.property_id, p.property_name || '')
    revenue.set(p.property_id, (revenue.get(p.property_id) || 0) + Number(p.amount || 0))
  }
  for (const m of maintenance || []) {
    if (!m.property_id) continue
    names.set(m.property_id, m.property_name || names.get(m.property_id) || '')
    expense.set(m.property_id, (expense.get(m.property_id) || 0) + Number(m.cost_amount || 0))
  }

  const ids = new Set([...revenue.keys(), ...expense.keys()])
  const rows = []
  for (const id of ids) {
    const grossCollected = Number(revenue.get(id) || 0)
    const maintenanceOpex = Number(expense.get(id) || 0)
    const netOperatingIncome = grossCollected - maintenanceOpex
    const marginPct = grossCollected > 0 ? (netOperatingIncome / grossCollected) * 100 : null
    rows.push({
      property_id: id,
      property_name: names.get(id) || '',
      gross_collected_revenue: grossCollected,
      maintenance_opex: maintenanceOpex,
      net_operating_income: netOperatingIncome,
      margin_pct: marginPct,
    })
  }

  const seen = new Set(rows.map((r) => r.property_id))
  for (const p of emptyProperties || []) {
    if (!p?.id || seen.has(p.id)) continue
    seen.add(p.id)
    rows.push({
      property_id: p.id,
      property_name: p.name || '',
      gross_collected_revenue: 0,
      maintenance_opex: 0,
      net_operating_income: 0,
      margin_pct: null,
    })
  }

  rows.sort((a, b) => b.net_operating_income - a.net_operating_income)
  return rows
}
