import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

function createTimeoutFetch(timeoutMs) {
  const ms = Number(timeoutMs)
  const timeout = Number.isFinite(ms) && ms > 0 ? ms : 15000

  return async function timeoutFetch(input, init) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeout)
    try {
      const nextInit = { ...(init || {}), signal: controller.signal }
      return await fetch(input, nextInit)
    } finally {
      clearTimeout(t)
    }
  }
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: createTimeoutFetch(15000),
      },
    })
  : null

