import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'
import { AIChatbot } from './AIChatbot'
import { LanguageToggle } from './LanguageToggle'
import { supabase } from '../lib/supabase/client'
import { ALODILA_LOGO_URL } from '../lib/brand/logoUrl'

function ChartNavIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 16V9M12 16V5M17 16v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function DashboardLayout() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const logoSrc = ALODILA_LOGO_URL
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')
  const isHome = location.pathname === '/'

  async function onSignOut() {
    try {
      await supabase?.auth?.signOut?.()
    } catch {
      // ignore
    }
  }

  const navClass = (active) =>
    [
      'block rounded-xl px-3 py-2 text-sm font-semibold transition',
      active ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-white/90 hover:bg-white/10',
    ].join(' ')

  return (
    <div dir={dir} className="min-h-screen bg-slate-50">
      <div className="flex">
        <aside className="no-print w-72 border-r border-slate-800/60 bg-slate-900 text-white shadow-md">
          <div className="flex min-h-screen flex-col px-5 py-6">
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

            <nav className="mt-8 flex flex-1 flex-col space-y-2">
              <Link to="/" className={navClass(isHome)}>
                {t('nav.dashboard')}
              </Link>
              <Link to="/properties" className={navClass(isActive('/properties'))}>
                {t('nav.properties')}
              </Link>
              <Link to="/owners" className={navClass(isActive('/owners'))}>
                {t('nav.owners')}
              </Link>
              <Link to="/units-inventory" className={navClass(isActive('/units-inventory'))}>
                {t('nav.unitsInventory')}
              </Link>
              <Link to="/tenants" className={navClass(isActive('/tenants'))}>
                {t('nav.tenants')}
              </Link>
              <Link to="/contracts" className={navClass(isActive('/contracts'))}>
                {t('nav.contracts')}
              </Link>
              <Link to="/maintenance" className={navClass(isActive('/maintenance'))}>
                {t('nav.maintenance')}
              </Link>
              <Link to="/finance" className={navClass(isActive('/finance'))}>
                {t('nav.finance')}
              </Link>
              <Link to="/reports" className={navClass(isActive('/reports'))}>
                <span className={`flex items-center gap-2 ${dir === 'rtl' ? 'justify-end' : 'justify-start'}`}>
                  <span>{t('nav.reports')}</span>
                  <ChartNavIcon className="text-amber-400" />
                </span>
              </Link>
              <Link to="/smart-import" className={navClass(isActive('/smart-import'))}>
                {t('nav.smartImport')}
              </Link>
            </nav>

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

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print border-b border-slate-200 bg-white shadow-sm">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-4">
              <div>
                <div className="text-sm font-bold text-slate-800">{t('nav.dashboard')}</div>
                <div className="mt-0.5 text-xs text-slate-500">{t('nav.headerSubtitle')}</div>
              </div>
              <LanguageToggle />
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 print:max-w-none">
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
