import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { hasSupabaseConfig, supabase } from '../../lib/supabase/client'
import { isOwnerPortalUser } from '../../lib/auth/roles'
import { ownerLookupForOnboarding } from '../../lib/db/owners'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { ALODILA_LOGO_URL } from '../../lib/brand/logoUrl'

function ownerAuthEmailFromNationalId(nationalId) {
  const nid = String(nationalId || '')
    .trim()
    .replace(/\s+/g, '')
  const domain = import.meta.env.VITE_OWNER_AUTH_EMAIL_DOMAIN || 'owner.alodila.local'
  return `${nid}@${domain}`
}

function isInvalidLoginError(err) {
  const m = String(err?.message || '').toLowerCase()
  return (
    m.includes('invalid login credentials') ||
    m.includes('invalid email or password') ||
    (m.includes('invalid') && m.includes('credential'))
  )
}

function isUserAlreadyRegistered(err) {
  const m = String(err?.message || '').toLowerCase()
  return m.includes('already been registered') || m.includes('already registered') || m.includes('user already')
}

function isValidSaudiNationalId(nid) {
  const d = String(nid || '').replace(/\s+/g, '')
  return /^\d{10}$/.test(d)
}

export default function DevLogin() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { push } = useToastDispatch()
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'
  const [portal, setPortal] = useState('staff')
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const title = useMemo(() => {
    if (portal === 'owner') return t('auth.ownerLogin')
    return mode === 'login' ? t('auth.staffLogin') : t('auth.staffSignup')
  }, [mode, portal, t])

  // Production safety: block self-service staff signup unless explicitly running in dev.
  const allowStaffSignup = import.meta.env.DEV

  // If someone refreshes on the signup tab in prod, force back to login.
  useEffect(() => {
    if (!allowStaffSignup && portal === 'staff' && mode !== 'login') setMode('login')
  }, [allowStaffSignup, mode, portal])

  async function onSubmitStaff(e) {
    e.preventDefault()
    if (!hasSupabaseConfig || !supabase) {
      push({
        type: 'error',
        title: t('auth.toastSupabaseTitle'),
        message: t('auth.toastSupabaseMsg'),
      })
      return
    }

    setBusy(true)
    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        push({ type: 'success', title: t('auth.toastLoginOk') })
        const user = data?.session?.user
        navigate(isOwnerPortalUser(user) ? '/owner' : '/', { replace: true })
      } else {
        if (!allowStaffSignup) throw new Error('Staff signup is disabled in production.')
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data?.session) {
          push({ type: 'success', title: t('auth.toastSignupOk') })
          navigate('/', { replace: true })
        } else {
          push({
            type: 'info',
            title: t('auth.toastSignupOk'),
            message: t('auth.toastSignupConfirm'),
          })
        }
      }
    } catch (err) {
      console.error('[DevLogin] staff', err)
      reportLoadFailure(push, err, t('auth.toastAuthFail'), true)
    } finally {
      setBusy(false)
    }
  }

  async function onSubmitOwner(e) {
    e.preventDefault()
    if (!hasSupabaseConfig || !supabase) {
      push({
        type: 'error',
        title: t('auth.toastSupabaseTitle'),
        message: t('auth.toastSupabaseMsg'),
      })
      return
    }

    const nid = String(nationalId || '').trim().replace(/\s+/g, '')
    if (!nid || !ownerPassword) {
      push({ type: 'error', title: t('auth.toastOwnerInput'), message: t('auth.toastOwnerInputMsg') })
      return
    }
    if (!isValidSaudiNationalId(nid)) {
      push({ type: 'error', title: t('auth.toastOwnerInput'), message: t('validation.nationalIdDigits') })
      return
    }

    const authEmail = ownerAuthEmailFromNationalId(nid)

    setBusy(true)
    try {
      const signIn = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: ownerPassword,
      })

      if (!signIn.error && signIn.data?.session?.user) {
        const user = signIn.data.session.user
        if (!isOwnerPortalUser(user)) {
          await supabase.auth.signOut()
          push({
            type: 'error',
            title: t('auth.toastOwnerInvalid'),
            message: t('auth.toastOwnerInvalidMsg'),
          })
          return
        }
        push({ type: 'success', title: t('auth.toastLoginOk') })
        navigate('/owner', { replace: true })
        return
      }

      if (signIn.error && !isInvalidLoginError(signIn.error)) {
        throw signIn.error
      }

      let ownerCrmId
      try {
        ownerCrmId = await ownerLookupForOnboarding(nid)
      } catch (lookupErr) {
        if (isIgnorableAuthLockError(lookupErr)) return
        push({
          type: 'error',
          title: t('auth.toastDbSetup'),
          message: lookupErr?.message || t('auth.toastDbSetupMsg'),
        })
        return
      }

      if (!ownerCrmId) {
        push({ type: 'error', title: t('auth.toastNotRegistered'), message: t('auth.toastNotRegisteredMsg') })
        return
      }

      const signUp = await supabase.auth.signUp({
        email: authEmail,
        password: ownerPassword,
        options: {
          data: {
            role: 'owner',
            owner_crm_id: ownerCrmId,
          },
        },
      })

      if (signUp.error) {
        if (isUserAlreadyRegistered(signUp.error)) {
          push({
            type: 'error',
            title: t('auth.toastWrongPassword'),
            message: t('auth.toastWrongPasswordMsg'),
          })
          return
        }
        throw signUp.error
      }

      if (signUp.data?.session?.user && isOwnerPortalUser(signUp.data.session.user)) {
        push({
          type: 'success',
          title: t('auth.toastWelcome'),
          message: t('auth.toastWelcomeMsg'),
        })
        navigate('/owner', { replace: true })
        return
      }

      const signIn2 = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: ownerPassword,
      })
      if (signIn2.error) throw signIn2.error
      if (!signIn2.data?.session?.user || !isOwnerPortalUser(signIn2.data.session.user)) {
        await supabase.auth.signOut()
        push({
          type: 'error',
          title: t('auth.toastEmailConfirm'),
          message: t('auth.toastEmailConfirmMsg'),
        })
        return
      }

      push({ type: 'success', title: t('auth.toastLoginOk') })
      navigate('/owner', { replace: true })
    } catch (err) {
      console.error('[DevLogin] owner', err)
      reportLoadFailure(push, err, t('auth.toastOwnerFail'), true)
    } finally {
      setBusy(false)
    }
  }

  const logoSrc = ALODILA_LOGO_URL
  const emailDomain = (import.meta.env.VITE_OWNER_AUTH_EMAIL_DOMAIN || 'owner.alodila.local').replace(/^@/, '')

  return (
    <div dir={dir} className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-5xl items-center gap-10 px-6 py-10">
        <div className="hidden flex-1 lg:block">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-white shadow-md">
            <div className="flex items-center gap-3">
              <img
                src={logoSrc}
                alt="ALODILA"
                className="h-12 w-12 rounded-2xl object-cover ring-1 ring-white/10"
                referrerPolicy="no-referrer"
                loading="eager"
                decoding="async"
              />
              <div className="leading-tight">
                <div className="text-base font-extrabold tracking-wide">{t('auth.brandLine')}</div>
                <div className="mt-0.5 text-sm text-slate-300">ALODILA-PMS</div>
              </div>
            </div>
            <div className="mt-6 text-sm text-slate-300">
              {t('auth.devNoteBody')}
            </div>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-slate-400">{t('auth.syntheticEmail')}</div>
              <div className="mt-1 text-sm font-semibold text-white">
                …@{emailDomain}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-4 flex rounded-xl border border-slate-200 bg-slate-100/80 p-1">
            <button
              type="button"
              className={[
                'flex-1 rounded-lg py-2 text-sm font-bold transition',
                portal === 'staff' ? 'border border-slate-200 bg-white text-slate-900 shadow-sm' : 'text-slate-600',
              ].join(' ')}
              onClick={() => setPortal('staff')}
            >
              {t('auth.portalStaff')}
            </button>
            <button
              type="button"
              className={[
                'flex-1 rounded-lg py-2 text-sm font-bold transition',
                portal === 'owner' ? 'border border-slate-200 bg-white text-slate-900 shadow-sm' : 'text-slate-600',
              ].join(' ')}
              onClick={() => setPortal('owner')}
            >
              {t('auth.portalOwner')}
            </button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{portal === 'owner' ? t('auth.ownerHint') : t('auth.staffHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              {portal === 'owner' ? (
                <form onSubmit={onSubmitOwner} className="space-y-4">
                  <div>
                    <Label>{t('auth.nationalId')}</Label>
                    <Input
                      value={nationalId}
                      onChange={(e) => setNationalId(e.target.value)}
                      autoComplete="username"
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </div>
                  <div>
                    <Label>{t('auth.password')}</Label>
                    <Input
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      type="password"
                      autoComplete="new-password"
                    />
                  </div>
                  <Button className="w-full" variant="gold" disabled={busy} type="submit">
                    {busy ? t('auth.busy') : t('auth.submit')}
                  </Button>
                </form>
              ) : (
                <form onSubmit={onSubmitStaff} className="space-y-4">
                  <div>
                    <Label>{t('auth.email')}</Label>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
                  </div>
                  <div>
                    <Label>{t('auth.password')}</Label>
                    <Input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type="password"
                      autoComplete="current-password"
                    />
                  </div>

                  <Button className="w-full" variant="gold" disabled={busy} type="submit">
                    {busy ? t('auth.busy') : t('auth.submit')}
                  </Button>

                  {allowStaffSignup ? (
                    <div className="text-center text-sm text-slate-500">
                      {mode === 'login' ? (
                        <>
                          {t('auth.noAccount')}{' '}
                          <button type="button" onClick={() => setMode('signup')} className="font-semibold text-amber-700 hover:underline">
                            {t('auth.staffSignup')}
                          </button>
                        </>
                      ) : (
                        <>
                          {t('auth.hasAccount')}{' '}
                          <button type="button" onClick={() => setMode('login')} className="font-semibold text-amber-700 hover:underline">
                            {t('auth.staffLogin')}
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
