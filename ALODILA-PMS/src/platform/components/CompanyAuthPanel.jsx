import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { Input, Label } from '../../components/ui/Input.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { useToastDispatch } from '../../components/toast/ToastProvider.jsx'
import {
  activateCompanyLogin,
  changeCompanyLoginEmail,
  forceCompanyPasswordChange,
  getCompanyAuthProfile,
  resetCompanyPassword,
  suspendCompanyLogin,
} from '../services/companyAuth.js'
import { formatCompanyDate } from '../lib/companyFormat.js'

/**
 * Authentication tab — login email / password / suspend controls.
 */
export function CompanyAuthPanel({ company, locale, onChanged }) {
  const { t } = useTranslation()
  const { push } = useToastDispatch()
  const userId = company?.auth_user_id

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  async function reloadProfile() {
    if (!userId) {
      setProfile(null)
      return
    }
    setLoading(true)
    try {
      const data = await getCompanyAuthProfile(userId)
      setProfile(data)
      setEmail(data?.email || '')
    } catch (e) {
      setProfile(null)
      push({ type: 'error', message: e?.message || t('platform.errors.authAdmin') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function run(action) {
    if (!userId) return
    setBusy(true)
    try {
      await action()
      push({ type: 'success', message: t('platform.toast.authUpdated') })
      await reloadProfile()
      onChanged?.()
    } catch (e) {
      push({ type: 'error', message: e?.message || t('platform.errors.authAdmin') })
    } finally {
      setBusy(false)
    }
  }

  if (!userId) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-600">{t('platform.auth.unbound')}</CardContent>
      </Card>
    )
  }

  const banned = Boolean(profile?.banned_until)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('platform.auth.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loading ? <div className="text-slate-500">{t('platform.common.loading')}</div> : null}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('platform.auth.loginEmail')}
            </div>
            <div className="mt-1 font-semibold text-slate-900">{profile?.email || '—'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('platform.auth.lastLogin')}
            </div>
            <div className="mt-1 text-slate-800">{formatCompanyDate(profile?.last_sign_in_at, locale)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('platform.auth.loginStatus')}
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {banned ? t('platform.auth.suspended') : t('platform.auth.active')}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('platform.auth.changeEmail')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="auth-email">{t('platform.form.loginEmail')}</Label>
            <Input id="auth-email" type="email" value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button
            variant="gold"
            disabled={busy || !email.trim()}
            onClick={() => void run(() => changeCompanyLoginEmail(userId, email.trim()))}
          >
            {t('platform.auth.changeEmail')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('platform.auth.resetPassword')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="auth-pass">{t('platform.form.password')}</Label>
              <Input
                id="auth-pass"
                type="password"
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="auth-pass2">{t('platform.form.confirmPassword')}</Label>
              <Input
                id="auth-pass2"
                type="password"
                value={confirm}
                disabled={busy}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button
            variant="gold"
            disabled={busy || password.length < 6 || password !== confirm}
            onClick={() =>
              void run(async () => {
                if (password !== confirm) throw new Error(t('platform.errors.passwordMismatch'))
                await resetCompanyPassword(userId, password)
                setPassword('')
                setConfirm('')
              })
            }
          >
            {t('platform.auth.resetPassword')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('platform.auth.controls')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="subtle" disabled={busy} onClick={() => void run(() => forceCompanyPasswordChange(userId))}>
            {t('platform.auth.forcePasswordChange')}
          </Button>
          {banned ? (
            <Button variant="gold" disabled={busy} onClick={() => void run(() => activateCompanyLogin(userId))}>
              {t('platform.auth.activateLogin')}
            </Button>
          ) : (
            <Button variant="subtle" disabled={busy} onClick={() => void run(() => suspendCompanyLogin(userId))}>
              {t('platform.auth.suspendLogin')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
