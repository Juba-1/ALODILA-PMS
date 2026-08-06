/** Plan labels stored in companies.notes (no billing schema). */

export const COMPANY_PLANS = /** @type {const} */ (['trial', 'starter', 'growth', 'enterprise'])

const PLAN_PREFIX = 'Plan:'

/**
 * @param {string | null | undefined} notes
 * @returns {{ plan: string | null, notes: string }}
 */
export function parseNotesPlan(notes) {
  const raw = String(notes ?? '')
  const lines = raw.split(/\r?\n/)
  if (!lines.length) return { plan: null, notes: '' }
  const first = lines[0].trim()
  const m = first.match(/^Plan:\s*([a-z0-9_-]+)\s*$/i)
  if (!m) return { plan: null, notes: raw }
  const plan = String(m[1]).toLowerCase()
  const rest = lines.slice(1).join('\n').replace(/^\n+/, '')
  return {
    plan: COMPANY_PLANS.includes(/** @type {*} */ (plan)) ? plan : plan,
    notes: rest,
  }
}

/**
 * @param {string | null | undefined} notesBody
 * @param {string | null | undefined} plan
 */
export function encodeNotesPlan(notesBody, plan) {
  const body = notesBody == null ? '' : String(notesBody)
  const p = String(plan || '').trim().toLowerCase()
  if (!p) return body.trim() || null
  const combined = `${PLAN_PREFIX} ${p}\n${body}`.trim()
  return combined || null
}

export function planFromCompany(company) {
  return parseNotesPlan(company?.notes).plan
}

export function notesBodyFromCompany(company) {
  return parseNotesPlan(company?.notes).notes
}

export function isPaidPlan(plan) {
  return plan === 'starter' || plan === 'growth' || plan === 'enterprise'
}

export function isTrialPlan(plan) {
  return plan === 'trial'
}
