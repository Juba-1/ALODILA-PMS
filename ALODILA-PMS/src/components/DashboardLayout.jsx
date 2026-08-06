import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'
import { AIChatbot } from './AIChatbot'
import { LanguageToggle } from './LanguageToggle'
import { HamburgerButton, MobileNavDrawer } from './MobileNavDrawer'
import { supabase } from '../lib/supabase/client'
import { ALODILA_LOGO_URL } from '../lib/brand/logoUrl'
import { COMPANY_HOME, companyPath } from '../lib/routing/paths.js'

function ChartNavIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 16V9M12 16V5M17 16v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

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
        <div className="text-sm font-extrabold tracking-wide">{t('nav.brandGroup')}</div>
        <div className="mt-0.5 text-xs text-slate-300">{t('nav.productName')}</div>
      </div>
    </div>
  )
}

function NavLinks({ t, isActive, isHome, dir, onNavigate }) {
  const navClass = (active) =>
    [
      'block rounded-xl px-3 py-2 text-sm font-semibold transition',
      active ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-white/90 hover:bg-white/10',
    ].join(' ')
  const handle = () => onNavigate?.()
  return (
    <nav className="flex flex-col space-y-2">
      <Link to={COMPANY_HOME} className={navClass(isHome)} onClick={handle}>
        {t('nav.dashboard')}
      </Link>
      <Link to={companyPath('properties')} className={navClass(isActive(companyPath('properties')))} onClick={handle}>
        {t('nav.properties')}
      </Link>
      <Link to={companyPath('owners')} className={navClass(isActive(companyPath('owners')))} onClick={handle}>
        {t('nav.owners')}
      </Link>
      <Link
        to={companyPath('units-inventory')}
        className={navClass(isActive(companyPath('units-inventory')))}
        onClick={handle}
      >
        {t('nav.unitsInventory')}
      </Link>
      <Link to={companyPath('tenants')} className={navClass(isActive(companyPath('tenants')))} onClick={handle}>
        {t('nav.tenants')}
      </Link>
      <Link to={companyPath('contracts')} className={navClass(isActive(companyPath('contracts')))} onClick={handle}>
        {t('nav.contracts')}
      </Link>
      <Link
        to={companyPath('maintenance')}
        className={navClass(isActive(companyPath('maintenance')))}
        onClick={handle}
      >
        {t('nav.maintenance')}
      </Link>
      <Link to={companyPath('finance')} className={navClass(isActive(companyPath('finance')))} onClick={handle}>
        {t('nav.finance')}
      </Link>
      <Link to={companyPath('reports')} className={navClass(isActive(companyPath('reports')))} onClick={handle}>
        <span className={`flex items-center gap-2 ${dir === 'rtl' ? 'justify-end' : 'justify-start'}`}>
          <span>{t('nav.reports')}</span>
          <ChartNavIcon className="text-amber-400" />
        </span>
      </Link>
      <Link
        to={companyPath('smart-import')}
        className={navClass(isActive(companyPath('smart-import')))}
        onClick={handle}
      >
        {t('nav.smartImport')}
      </Link>
    </nav>
  )
}

export default function DashboardLayout() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const logoSrc = ALODILA_LOGO_URL
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'

  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')
  const isHome = location.pathname === COMPANY_HOME || location.pathname === `${COMPANY_HOME}/`

  async function onSignOut() {
    try {
      await supabase?.auth?.signOut?.()
    } catch {
      // ignore
    }
  }

  return (
    <div dir={dir} className="min-h-screen bg-slate-50">
      <div className="flex">
        <aside className="no-print sticky top-0 hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-slate-800/60 bg-slate-900 text-white shadow-md md:block">
          <div className="flex min-h-screen flex-col px-5 py-6">
            <BrandHeader logoSrc={logoSrc} t={t} />
            <div className="mt-8 flex-1">
              <NavLinks t={t} isActive={isActive} isHome={isHome} dir={dir} />
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <div className="font-semibold text-white">{t('nav.devEnv')}</div>
              <div className="mt-2">
                <Button variant="subtle" className="w-full border-slate-600 bg-slate-800 text-white hover:bg-slate-700" onClick={onSignOut}>
                  {t('nav.signOut')}
                </Button>
              </div>
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
              <NavLinks t={t} isActive={isActive} isHome={isHome} dir={dir} onNavigate={() => setMobileOpen(false)} />
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
                  <div className="text-sm font-bold text-slate-800">{t('nav.dashboard')}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{t('nav.headerSubtitle')}</div>
                </div>
              </div>
              <LanguageToggle />
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6 sm:py-6 print:max-w-none">
            <div className="print-only mb-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-md">
              <img
                src={logoSrc}
                alt=""
                className="mx-auto h-14 w-14 rounded-xl object-cover ring-1 ring-slate-200"
                referrerPolicy="no-referrer"
                loading="eager"
                decoding="async"
              />
              <div className="mt-3 text-sm font-extrabold text-slate-800">{t('nav.brandGroup')}</div>
              <div className="mt-1 text-xs text-slate-500">{t('nav.productName')}</div>
            </div>
            <Outlet />
          </main>
        </div>
      </div>
      <AIChatbot />
    </div>
  )
}
