import { supabase } from '../../lib/supabase/client.js'
import { COMPANY_SELECT_COLUMNS } from '../lib/constants.js'
import { validateCreateInput, validateUpdateInput } from '../lib/companyValidators.js'
import { buildCreatePayload, buildUpdatePayload } from '../lib/companyPayload.js'
import {
  assertCanChangeStatus,
  assertCanRestore,
  assertCanSoftDelete,
  assertCanUpdateIdentity,
  isProtectedCompany,
} from '../lib/protectedCompanies.js'
import { assertTransition } from '../lib/companyTransitions.js'
import { mapCompanyError, validationError, PlatformCompanyError } from './companiesErrors.js'
import { record as auditRecord } from '../extensions/audit/auditEmitter.js'
import { AUDIT_TYPES } from '../extensions/audit/auditTypes.js'
import { provisionCompanyLogin, getCompanyAuthProfile } from './companyAuth.js'
import { isPaidPlan, isTrialPlan, planFromCompany, notesBodyFromCompany, encodeNotesPlan } from '../lib/companyPlan.js'

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  }
  return supabase
}

async function currentActorUserId() {
  try {
    const client = requireClient()
    const { data } = await client.auth.getUser()
    return data?.user?.id ?? null
  } catch {
    return null
  }
}

async function countByCompany(table) {
  const client = requireClient()
  const { data, error } = await client.from(table).select('company_id').eq('is_deleted', false)
  if (error) throw error
  /** @type {Record<string, number>} */
  const map = {}
  for (const row of data || []) {
    const id = row?.company_id
    if (!id) continue
    map[id] = (map[id] || 0) + 1
  }
  return map
}

/**
 * READ-ONLY list of companies (optionally enriched with portfolio counts).
 * @param {{ q?: string, status?: string, plan?: string, includeDeleted?: boolean, enrich?: boolean }} [filters]
 */
export async function listCompanies(filters = {}) {
  const client = requireClient()
  const q = String(filters.q || '').trim()
  const status = String(filters.status || '').trim()
  const planFilter = String(filters.plan || '').trim().toLowerCase()
  const includeDeleted = Boolean(filters.includeDeleted)
  const enrich = filters.enrich !== false

  let query = client.from('companies').select(COMPANY_SELECT_COLUMNS).order('created_at', { ascending: false })

  if (!includeDeleted) {
    query = query.eq('is_deleted', false)
  }

  if (status) {
    query = query.eq('status', status)
  }

  if (q) {
    const escaped = q.replace(/[%_,]/g, '')
    query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`)
  }

  const { data, error } = await query
  if (error) throw error
  let rows = data || []

  if (planFilter) {
    rows = rows.filter((r) => planFromCompany(r) === planFilter)
  }

  if (!enrich) return rows

  const [propsMap, contractsMap] = await Promise.all([
    countByCompany('properties'),
    countByCompany('contracts'),
  ])

  const enriched = rows.map((row) => ({
    ...row,
    plan: planFromCompany(row),
    notes_body: notesBodyFromCompany(row),
    properties_count: propsMap[row.id] || 0,
    contracts_count: contractsMap[row.id] || 0,
    login_email: null,
    last_login_at: null,
  }))

  await Promise.all(
    enriched.map(async (row) => {
      if (!row.auth_user_id) return
      try {
        const profile = await getCompanyAuthProfile(row.auth_user_id)
        row.login_email = profile?.email || null
        row.last_login_at = profile?.last_sign_in_at || null
      } catch {
        // leave — when auth admin API unavailable
      }
    }),
  )

  return enriched
}

/**
 * READ-ONLY single company by id.
 * @param {string} id
 */
export async function getCompany(id) {
  const client = requireClient()
  const companyId = String(id || '').trim()
  if (!companyId) return null

  const { data, error } = await client
    .from('companies')
    .select(COMPANY_SELECT_COLUMNS)
    .eq('id', companyId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return {
    ...data,
    plan: planFromCompany(data),
    notes_body: notesBodyFromCompany(data),
  }
}

/**
 * Portfolio counts for one company (SA Soft RLS can read all tenants).
 */
export async function getCompanyPortfolioStats(companyId) {
  const client = requireClient()
  const cid = String(companyId || '').trim()
  if (!cid) {
    return {
      properties: 0,
      units: 0,
      owners: 0,
      tenants: 0,
      contracts: 0,
      payments: 0,
      maintenance: 0,
    }
  }

  async function count(table) {
    const { count, error } = await client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('company_id', cid)
      .eq('is_deleted', false)
    if (error) throw error
    return count || 0
  }

  const [properties, units, owners, tenants, contracts, payments, maintenance] = await Promise.all([
    count('properties'),
    count('units'),
    count('owners'),
    count('tenants'),
    count('contracts'),
    count('payments'),
    count('maintenance_requests'),
  ])

  return { properties, units, owners, tenants, contracts, payments, maintenance }
}

/**
 * READ-ONLY aggregates for the platform dashboard.
 */
export async function getCompanyStats() {
  const client = requireClient()

  const { data, error } = await client
    .from('companies')
    .select(COMPANY_SELECT_COLUMNS)
    .order('updated_at', { ascending: false })

  if (error) throw error
  const rows = data || []

  const stats = {
    total: 0,
    active: 0,
    suspended: 0,
    provisioning: 0,
    trial: 0,
    paid: 0,
    deleted: 0,
    properties: 0,
    units: 0,
    contracts: 0,
    owners: 0,
  }

  for (const row of rows) {
    if (row.is_deleted) {
      stats.deleted += 1
      continue
    }
    stats.total += 1
    if (row.status === 'active') stats.active += 1
    else if (row.status === 'suspended') stats.suspended += 1
    else if (row.status === 'provisioning') stats.provisioning += 1

    const plan = planFromCompany(row)
    if (isTrialPlan(plan)) stats.trial += 1
    if (isPaidPlan(plan)) stats.paid += 1
  }

  const recent = rows
    .filter((r) => !r.is_deleted)
    .slice(0, 8)
    .map((r) => ({ ...r, plan: planFromCompany(r) }))

  try {
    const [props, units, contracts, owners] = await Promise.all([
      client.from('properties').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
      client.from('units').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
      client.from('contracts').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
      client.from('owners').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
    ])
    stats.properties = props.count || 0
    stats.units = units.count || 0
    stats.contracts = contracts.count || 0
    stats.owners = owners.count || 0
  } catch {
    // leave portfolio totals at 0 if SA cannot read (should not happen)
  }

  return { stats, recent }
}

/**
 * Create company row then provision company login (Auth + bind).
 * Rolls back soft-delete on provision failure when possible.
 */
export async function createCompany(input) {
  try {
    const validated = validateCreateInput(input)
    if (!validated.ok) throw validationError(validated.fields)

    const client = requireClient()
    const payload = buildCreatePayload(validated.value)

    const { data, error } = await client
      .from('companies')
      .insert(payload)
      .select(COMPANY_SELECT_COLUMNS)
      .single()

    if (error) throw error

    try {
      await provisionCompanyLogin({
        companyId: data.id,
        email: validated.value.loginEmail,
        password: validated.value.password,
      })
    } catch (authErr) {
      try {
        await client
          .from('companies')
          .update({ is_deleted: true, status: 'suspended', notes: encodeNotesPlan('PROVISION_FAILED', validated.value.plan) })
          .eq('id', data.id)
      } catch {
        // ignore rollback failure
      }
      throw authErr
    }

    const refreshed = await getCompany(data.id)

    await auditRecord({
      type: AUDIT_TYPES.COMPANY_CREATED,
      companyId: data.id,
      actorUserId: await currentActorUserId(),
      payload: {
        name: data.name,
        slug: data.slug,
        status: data.status,
        plan: validated.value.plan,
        loginEmail: validated.value.loginEmail,
      },
    })

    return refreshed || data
  } catch (e) {
    throw mapCompanyError(e)
  }
}

export async function updateCompany(id, input) {
  try {
    const companyId = String(id || '').trim()
    if (!companyId) throw new PlatformCompanyError('NOT_FOUND')

    const existing = await getCompany(companyId)
    if (!existing) throw new PlatformCompanyError('NOT_FOUND')

    const lockName = isProtectedCompany(existing)
    const lockSlug = isProtectedCompany(existing)

    try {
      assertCanUpdateIdentity(existing, input)
    } catch (e) {
      await auditRecord({
        type: AUDIT_TYPES.COMPANY_PROTECTION_DENIED,
        companyId,
        actorUserId: await currentActorUserId(),
        payload: { action: 'update_identity', patch: { name: input?.name, slug: input?.slug } },
      })
      throw e
    }

    const validated = validateUpdateInput(input, { lockName, lockSlug })
    if (!validated.ok) throw validationError(validated.fields)

    const nextNotesBody =
      'notes' in validated.value ? validated.value.notes : notesBodyFromCompany(existing)
    const nextPlan = 'plan' in validated.value ? validated.value.plan : planFromCompany(existing)

    const payload = buildUpdatePayload({
      ...validated.value,
      notes: nextNotesBody,
      plan: nextPlan,
    })

    if ('status' in validated.value) {
      assertCanChangeStatus(existing)
      assertTransition(existing.status, validated.value.status)
      payload.status = validated.value.status
    }

    if (Object.keys(payload).length === 0) return existing

    const client = requireClient()
    const { data, error } = await client
      .from('companies')
      .update(payload)
      .eq('id', companyId)
      .select(COMPANY_SELECT_COLUMNS)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new PlatformCompanyError('NOT_FOUND')

    await auditRecord({
      type: AUDIT_TYPES.COMPANY_UPDATED,
      companyId,
      actorUserId: await currentActorUserId(),
      payload: { before: { name: existing.name, slug: existing.slug }, after: payload },
    })

    return {
      ...data,
      plan: planFromCompany(data),
      notes_body: notesBodyFromCompany(data),
    }
  } catch (e) {
    throw mapCompanyError(e)
  }
}

export async function setCompanyStatus(id, nextStatus) {
  try {
    const companyId = String(id || '').trim()
    if (!companyId) throw new PlatformCompanyError('NOT_FOUND')

    const existing = await getCompany(companyId)
    if (!existing) throw new PlatformCompanyError('NOT_FOUND')
    if (existing.is_deleted) throw new PlatformCompanyError('INVALID_TRANSITION')

    try {
      assertCanChangeStatus(existing)
    } catch (e) {
      await auditRecord({
        type: AUDIT_TYPES.COMPANY_PROTECTION_DENIED,
        companyId,
        actorUserId: await currentActorUserId(),
        payload: { action: 'status_change', to: nextStatus },
      })
      throw e
    }

    assertTransition(existing.status, nextStatus)

    const client = requireClient()
    const { data, error } = await client
      .from('companies')
      .update({ status: nextStatus })
      .eq('id', companyId)
      .select(COMPANY_SELECT_COLUMNS)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new PlatformCompanyError('NOT_FOUND')

    await auditRecord({
      type: AUDIT_TYPES.COMPANY_STATUS_CHANGED,
      companyId,
      actorUserId: await currentActorUserId(),
      payload: { from: existing.status, to: nextStatus },
    })

    return data
  } catch (e) {
    throw mapCompanyError(e)
  }
}

export async function softDeleteCompany(id) {
  try {
    const companyId = String(id || '').trim()
    if (!companyId) throw new PlatformCompanyError('NOT_FOUND')

    const existing = await getCompany(companyId)
    if (!existing) throw new PlatformCompanyError('NOT_FOUND')
    if (existing.is_deleted) return existing

    try {
      assertCanSoftDelete(existing)
    } catch (e) {
      await auditRecord({
        type: AUDIT_TYPES.COMPANY_PROTECTION_DENIED,
        companyId,
        actorUserId: await currentActorUserId(),
        payload: { action: 'soft_delete' },
      })
      throw e
    }

    const client = requireClient()
    const { data, error } = await client
      .from('companies')
      .update({ is_deleted: true, status: 'suspended' })
      .eq('id', companyId)
      .select(COMPANY_SELECT_COLUMNS)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new PlatformCompanyError('NOT_FOUND')

    await auditRecord({
      type: AUDIT_TYPES.COMPANY_SOFT_DELETED,
      companyId,
      actorUserId: await currentActorUserId(),
      payload: { slug: existing.slug },
    })

    return data
  } catch (e) {
    throw mapCompanyError(e)
  }
}

/** Thin restore: clears is_deleted only (same soft-delete architecture). */
export async function restoreCompany(id) {
  try {
    const companyId = String(id || '').trim()
    if (!companyId) throw new PlatformCompanyError('NOT_FOUND')

    const existing = await getCompany(companyId)
    if (!existing) throw new PlatformCompanyError('NOT_FOUND')
    if (!existing.is_deleted) return existing

    try {
      assertCanRestore(existing)
    } catch (e) {
      await auditRecord({
        type: AUDIT_TYPES.COMPANY_PROTECTION_DENIED,
        companyId,
        actorUserId: await currentActorUserId(),
        payload: { action: 'restore' },
      })
      throw e
    }

    const client = requireClient()
    const { data, error } = await client
      .from('companies')
      .update({ is_deleted: false })
      .eq('id', companyId)
      .select(COMPANY_SELECT_COLUMNS)
      .maybeSingle()

    if (error) throw error
    if (!data) throw new PlatformCompanyError('NOT_FOUND')

    await auditRecord({
      type: AUDIT_TYPES.COMPANY_RESTORED,
      companyId,
      actorUserId: await currentActorUserId(),
      payload: { slug: existing.slug },
    })

    return data
  } catch (e) {
    throw mapCompanyError(e)
  }
}

export async function signOutPlatform() {
  const client = requireClient()
  const { error } = await client.auth.signOut()
  if (error) throw error
}
