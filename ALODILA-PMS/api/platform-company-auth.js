/**
 * Platform company Auth Admin proxy (Vercel serverless).
 * - Verifies caller JWT is platform_super_admin / super_admin
 * - Uses SUPABASE_SERVICE_ROLE_KEY only on the server
 * - Does not change schema / RLS / company business tables beyond companies.auth_user_id
 */

import { createClient } from '@supabase/supabase-js'

function json(res, statusCode, body) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function getBearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  const m = String(h).match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function anonClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function isPlatformSa(user) {
  const role = String(user?.app_metadata?.role || '').trim()
  return role === 'platform_super_admin' || role === 'super_admin'
}

async function requirePlatformSa(req) {
  const token = getBearer(req)
  if (!token) return { error: 'Missing Authorization bearer token', status: 401 }

  const anon = anonClient()
  if (!anon) return { error: 'Server Supabase anon config missing', status: 500 }

  const { data, error } = await anon.auth.getUser(token)
  if (error || !data?.user) return { error: 'Invalid session', status: 401 }
  if (!isPlatformSa(data.user)) return { error: 'Forbidden — platform admin only', status: 403 }
  return { user: data.user, token }
}

function parseBody(req) {
  if (typeof req.body === 'object' && req.body) return req.body
  try {
    return JSON.parse(req.body || '{}')
  } catch {
    return {}
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  const authz = await requirePlatformSa(req)
  if (authz.error) return json(res, authz.status, { error: authz.error })

  const admin = adminClient()
  if (!admin) {
    return json(res, 500, {
      error: 'Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_URL) on the server environment.',
    })
  }

  const body = parseBody(req)
  const action = String(body.action || '').trim()

  try {
    if (action === 'get_auth') {
      const userId = String(body.userId || '').trim()
      if (!userId) return json(res, 400, { error: 'userId is required' })
      const { data, error } = await admin.auth.admin.getUserById(userId)
      if (error) return json(res, 400, { error: error.message })
      const u = data?.user
      return json(res, 200, {
        email: u?.email || null,
        last_sign_in_at: u?.last_sign_in_at || null,
        banned_until: u?.banned_until || null,
        email_confirmed_at: u?.email_confirmed_at || null,
        force_password_change: Boolean(u?.app_metadata?.force_password_change),
      })
    }

    if (action === 'provision') {
      const companyId = String(body.companyId || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      if (!companyId || !email || !password) {
        return json(res, 400, { error: 'companyId, email, and password are required' })
      }
      if (password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' })

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          role: 'company',
          company_id: companyId,
          provider: 'email',
          providers: ['email'],
        },
        user_metadata: { email_verified: true },
      })
      if (createErr) return json(res, 400, { error: createErr.message })

      const userId = created?.user?.id
      if (!userId) return json(res, 500, { error: 'Auth user created without id' })

      const { data: company, error: bindErr } = await admin
        .from('companies')
        .update({ auth_user_id: userId })
        .eq('id', companyId)
        .select('id,auth_user_id')
        .maybeSingle()

      if (bindErr) {
        await admin.auth.admin.deleteUser(userId)
        return json(res, 400, { error: bindErr.message })
      }

      return json(res, 200, { userId, email, company })
    }

    if (action === 'reset_password') {
      const userId = String(body.userId || '').trim()
      const password = String(body.password || '')
      if (!userId || !password) return json(res, 400, { error: 'userId and password are required' })
      if (password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' })
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json(res, 400, { error: error.message })
      return json(res, 200, { ok: true })
    }

    if (action === 'change_email') {
      const userId = String(body.userId || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      if (!userId || !email) return json(res, 400, { error: 'userId and email are required' })
      const { error } = await admin.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      })
      if (error) return json(res, 400, { error: error.message })
      return json(res, 200, { ok: true, email })
    }

    if (action === 'force_password_change') {
      const userId = String(body.userId || '').trim()
      if (!userId) return json(res, 400, { error: 'userId is required' })
      const { data: existing, error: getErr } = await admin.auth.admin.getUserById(userId)
      if (getErr) return json(res, 400, { error: getErr.message })
      const meta = { ...(existing?.user?.app_metadata || {}), force_password_change: true }
      const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: meta })
      if (error) return json(res, 400, { error: error.message })
      return json(res, 200, { ok: true })
    }

    if (action === 'suspend_login') {
      const userId = String(body.userId || '').trim()
      if (!userId) return json(res, 400, { error: 'userId is required' })
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: '876600h' })
      if (error) return json(res, 400, { error: error.message })
      return json(res, 200, { ok: true })
    }

    if (action === 'activate_login') {
      const userId = String(body.userId || '').trim()
      if (!userId) return json(res, 400, { error: 'userId is required' })
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
      if (error) return json(res, 400, { error: error.message })
      return json(res, 200, { ok: true })
    }

    return json(res, 400, { error: `Unknown action: ${action}` })
  } catch (e) {
    return json(res, 500, { error: String(e?.message || e).slice(0, 800) })
  }
}
