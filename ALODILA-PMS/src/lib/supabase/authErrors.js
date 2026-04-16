import i18n from '../../i18n/config.js'

/**
 * Supabase GoTrue + Web Locks can throw/reject with AbortError or "Lock broken… steal"
 * when React Strict Mode double-mounts and overlapping getSession/getUser run.
 * These are safe to ignore after unmount; do not surface to an error boundary.
 */
/** User-facing copy for dropped connections / offline (Supabase fetch failures). */
export function friendlyErrorMessage(err) {
  const raw = String(err?.message ?? err ?? '')
  const low = raw.toLowerCase()
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return i18n.t('errors.offline')
  }
  if (
    low.includes('failed to fetch') ||
    low.includes('networkerror') ||
    low.includes('network request failed') ||
    low.includes('load failed') ||
    low.includes('err_internet_disconnected')
  ) {
    return i18n.t('errors.network')
  }
  return raw || i18n.t('errors.generic')
}

export function isIgnorableAuthLockError(err) {
  if (err == null) return false
  const name = err?.name || ''
  const msg = String(err?.message ?? err)
  if (name === 'AbortError') return true
  if (msg.includes('AbortError')) return true
  if (msg.includes('The user aborted')) return true
  if (msg.includes('Lock broken')) return true
  if (msg.includes("'steal'")) return true
  if (msg.includes('steal')) return true
  return false
}

/**
 * Show an error toast for failed loads/mutations unless the error is a Strict Mode auth-lock race.
 * @param {(payload: { type: 'error', title: string, message?: string }) => void} toastPush
 */
export function reportLoadFailure(toastPush, err, title, mounted = true) {
  if (!mounted) return
  if (isIgnorableAuthLockError(err)) return
  if (typeof toastPush !== 'function') return
  toastPush({ type: 'error', title, message: friendlyErrorMessage(err) })
}
