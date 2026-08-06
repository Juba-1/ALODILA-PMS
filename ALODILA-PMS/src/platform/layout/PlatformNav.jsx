import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../components/ui/cn.js'

const NAV_ITEMS = [
  { to: '/platform', end: true, key: 'platform.nav.dashboard' },
  { to: '/platform/companies', key: 'platform.nav.companies' },
  { to: '/platform/settings', key: 'platform.nav.settings' },
]

function isNavActive(pathname, to, end) {
  if (end) return pathname === to || pathname === `${to}/`
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function PlatformNav({ onNavigate }) {
  const { t } = useTranslation()
  const location = useLocation()
  const handle = () => onNavigate?.()

  const navClass = (active) =>
    cn(
      'block rounded-lg px-3 py-2 text-sm font-semibold transition',
      active ? 'bg-cyan-400 text-slate-900 shadow-sm' : 'text-white/90 hover:bg-white/10',
    )

  return (
    <nav className="flex flex-col gap-1.5">
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(location.pathname, item.to, item.end)
        return (
          <Link key={item.to} to={item.to} className={navClass(active)} onClick={handle}>
            {t(item.key)}
          </Link>
        )
      })}
    </nav>
  )
}
