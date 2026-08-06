import { supabase } from '../../lib/supabase/client.js'

async function accessToken() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data?.session?.access_token
  if (!token) throw new Error('Not authenticated.')
  return token
}

/**
 * Call Platform Auth Admin proxy.
 * @param {string} action
 * @param {Record<string, unknown>} payload
 */
export async function platformCompanyAuth(action, payload = {}) {
  const token = await accessToken()
  const res = await fetch('/api/platform-company-auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.error || `Auth admin failed (${res.status})`)
    err.status = res.status
    err.code = 'AUTH_ADMIN'
    throw err
  }
  return body
}

export function provisionCompanyLogin({ companyId, email, password }) {
  return platformCompanyAuth('provision', { companyId, email, password })
}

export function getCompanyAuthProfile(userId) {
  return platformCompanyAuth('get_auth', { userId })
}

export function resetCompanyPassword(userId, password) {
  return platformCompanyAuth('reset_password', { userId, password })
}

export function changeCompanyLoginEmail(userId, email) {
  return platformCompanyAuth('change_email', { userId, email })
}

export function forceCompanyPasswordChange(userId) {
  return platformCompanyAuth('force_password_change', { userId })
}

export function suspendCompanyLogin(userId) {
  return platformCompanyAuth('suspend_login', { userId })
}

export function activateCompanyLogin(userId) {
  return platformCompanyAuth('activate_login', { userId })
}
