import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from './ui/cn'

/**
 * Slim, self-contained drawer used by the dashboard + owner layouts on
 * `<md` viewports. The owning component renders the sidebar contents as
 * children; this shell handles the overlay, body-scroll lock, escape key,
 * and direction-aware slide animation.
 */
export function MobileNavDrawer({ open, onClose, dir = 'rtl', children }) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const slideFrom = dir === 'rtl' ? 'right-0' : 'left-0'
  const translateOpen = 'translate-x-0'
  const translateClosed = dir === 'rtl' ? 'translate-x-full' : '-translate-x-full'

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'fixed inset-0 z-50 md:hidden transition-opacity',
        open ? 'opacity-100 pointer-events-auto' : 'pointer-events-none opacity-0',
      )}
    >
      <button
        type="button"
        aria-label={t('a11y.closeMenu')}
        onClick={onClose}
        className={cn('absolute inset-0 bg-slate-900/60 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
      />
      <aside
        className={cn(
          'absolute top-0 h-full w-80 max-w-[85%] overflow-y-auto bg-slate-900 text-white shadow-2xl transition-transform duration-200 ease-out',
          slideFrom,
          open ? translateOpen : translateClosed,
        )}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </aside>
    </div>
  )
}

export function HamburgerButton({ onClick, className = '' }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('a11y.openMenu')}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm ring-1 ring-slate-800 hover:bg-slate-800 md:hidden',
        className,
      )}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}
