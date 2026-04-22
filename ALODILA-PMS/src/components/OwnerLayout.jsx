import { Link, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AIChatbot } from './AIChatbot'
import { Button } from './ui/Button'
import { LanguageToggle } from './LanguageToggle'
import { HamburgerButton, MobileNavDrawer } from './MobileNavDrawer'
import { supabase } from '../lib/supabase/client'
import { isIgnorableAuthLockError } from '../lib/supabase/authErrors'
import { isOwnerPortalUser, ownerCrmIdFromUser } from '../lib/auth/roles'
import { ALODILA_LOGO_URL } from '../lib/brand/logoUrl'

function BrandHeader({ logoSrc, t }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={logoSrc}
        alt="ALODILA"
        className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/10"
        referrerPolicy="no-referrer"
        loading="eager"
        decoding="async"
      />
      <div className="leading-tight">
        <div className="text-sm font-extrabold tracking-wide">{t('ownerNav.portalTitle')}</div>
        <div className="mt-0.5 text-xs text-slate-300">{t('ownerNav.readOnly')}</div>
      </div>
    </div>
  )
}

function NavLinks({ t, isActive, pathname, onNavigate }) {
  const navClass = (active) =>
    [
      'block rounded-xl px-3 py-2 text-sm font-semibold transition',
      active ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-white/90 hover:bg-white/10',
    ].join(' ')
  const handle = () => onNavigate?.()
  return (
    <nav className="flex flex-col space-y-2">
      <Link to="/owner" className={navClass(pathname === '/owner')} onClick={handle}>
        {t('ownerNav.dashboard')}
      </Link>
      <Link to="/owner/properties" className={navClass(isActive('/owner/properties'))} onClick={handle}>
        {t('ownerNav.properties')}
      </Link>
      <Link to="/owner/maintenance" className={navClass(isActive('/owner/maintenance'))} onClick={handle}>
        {t('ownerNav.maintenance')}
      </Link>
      <Link to="/owner/reports" className={navClass(isActive('/owner/reports'))} onClick={handle}>
        {t('ownerNav.reports')}
      </Link>
    </nav>
  )
}

export default function OwnerLayout() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error && !isIgnorableAuthLockError(error)) {
          console.warn('[OwnerLayout] getUser', error.message || error)
        }
        setUser(data?.user ?? null)
        setReady(true)
      })
      .catch((e) => {
        if (cancelled) return
        if (!isIgnorableAuthLockError(e)) console.warn('[OwnerLayout] getUser', e)
        setUser(null)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  async function onSignOut() {
    try {
      await supabase?.auth?.signOut?.()
    } catch {
      // ignore
    }
  }

  if (!ready) {
    return (
      <div dir={dir} className="min-h-screen bg-slate-50 p-8 text-sm text-slate-600">
        {t('common.loading')}
      </div>
    )
  }

  if (!isOwnerPortalUser(user)) {
    return <Navigate to="/" replace />
  }

  const ownerCrmId = ownerCrmIdFromUser(user)
  if (!String(ownerCrmId || '').trim()) {
    return <Navigate to="/" replace />
  }

  const logoSrc = ALODILA_LOGO_URL

  return (
    <div dir={dir} className="min-h-screen bg-slate-50">
      <div className="flex">
        <aside className="no-print sticky top-0 hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-slate-800/60 bg-slate-900 text-white shadow-md md:block">
          <div className="flex min-h-screen flex-col px-5 py-6">
            <BrandHeader logoSrc={logoSrc} t={t} />
            <div className="mt-8 flex-1">
              <NavLinks t={t} isActive={isActive} pathname={location.pathname} />
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <Button variant="subtle" className="w-full border-slate-600 bg-slate-800 text-white hover:bg-slate-700" onClick={onSignOut}>
                {t('nav.signOut')}
              </Button>
            </div>
          </div>
        </aside>

        <MobileNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} dir={dir}>
          <div className="flex min-h-full flex-col px-5 py-6">
            <div className="flex items-center justify-between">
              <BrandHeader logoSrc={logoSrc} t={t} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t('a11y.close')}
                className="rounded-lg p-2 text-white/70 hover:bg-white/10"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mt-8 flex-1">
              <NavLinks t={t} isActive={isActive} pathname={location.pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <Button variant="subtle" className="w-full border-slate-600 bg-slate-800 text-white hover:bg-slate-700" onClick={onSignOut}>
                {t('nav.signOut')}
              </Button>
            </div>
          </div>
        </MobileNavDrawer>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex items-center gap-3">
                <HamburgerButton onClick={() => setMobileOpen(true)} />
                <div>
                  <div className="text-sm font-bold text-slate-800">{t('ownerNav.portalTitle')}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{t('ownerNav.headerSubtitle')}</div>
                </div>
              </div>
              <LanguageToggle />
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6 sm:py-6">
            <Outlet context={{ ownerCrmId }} />
          </main>
        </div>
      </div>
      <AIChatbot />
    </div>
  )
}
