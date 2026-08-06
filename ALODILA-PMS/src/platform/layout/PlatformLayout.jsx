import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { LanguageToggle } from '../../components/LanguageToggle.jsx'
import { HamburgerButton, MobileNavDrawer } from '../../components/MobileNavDrawer.jsx'
import { ALODILA_LOGO_URL } from '../../lib/brand/logoUrl.js'
import { PlatformNav } from './PlatformNav.jsx'
import { signOutPlatform } from '../services/companies.js'

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
        <div className="text-sm font-extrabold tracking-wide">{t('platform.brand')}</div>
        <div className="mt-0.5 text-xs text-slate-300">{t('platform.brandSubtitle')}</div>
      </div>
    </div>
  )
}

export default function PlatformLayout() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  async function onSignOut() {
    try {
      await signOutPlatform()
    } catch {
      // ignore
    }
  }

  const logoSrc = ALODILA_LOGO_URL

  return (
    <div dir={dir} className="min-h-screen bg-slate-50">
      <div className="flex">
        <aside className="no-print sticky top-0 hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-cyan-900/40 bg-slate-950 text-white shadow-md md:block">
          <div className="flex min-h-screen flex-col px-5 py-6">
            <BrandHeader logoSrc={logoSrc} t={t} />
            <div className="mt-8 flex-1">
              <PlatformNav />
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <Button
                variant="subtle"
                className="w-full border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                onClick={onSignOut}
              >
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
              <PlatformNav onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <Button
                variant="subtle"
                className="w-full border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                onClick={onSignOut}
              >
                {t('nav.signOut')}
              </Button>
            </div>
          </div>
        </MobileNavDrawer>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex items-center gap-3">
                <HamburgerButton onClick={() => setMobileOpen(true)} />
                <div>
                  <div className="text-sm font-bold text-slate-800">{t('platform.brand')}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{t('platform.brandSubtitle')}</div>
                </div>
              </div>
              <LanguageToggle />
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6 sm:py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
