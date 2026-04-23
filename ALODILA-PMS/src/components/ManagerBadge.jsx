import { useTranslation } from 'react-i18next'
import { cn } from './ui/cn'

/**
 * Returns the first 1–2 glyph-cluster initials from a human name.
 * Works for both Arabic and Latin names.
 */
function computeInitials(name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return '·'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return Array.from(parts[0]).slice(0, 2).join('').toUpperCase()
  }
  const first = Array.from(parts[0])[0] || ''
  const last = Array.from(parts[parts.length - 1])[0] || ''
  return (first + last).toUpperCase()
}

/**
 * Deterministic gradient pair from a name. Keeps colours consistent per user.
 */
const GRADIENTS = [
  'from-amber-400 to-orange-500',
  'from-emerald-400 to-teal-500',
  'from-sky-400 to-indigo-500',
  'from-fuchsia-400 to-rose-500',
  'from-violet-400 to-purple-500',
  'from-cyan-400 to-blue-500',
  'from-lime-400 to-emerald-500',
  'from-rose-400 to-red-500',
]

function gradientFor(name) {
  const s = String(name || '')
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

/**
 * Visually polished "Managed by" badge — initials chip + name pill.
 *
 * Variants:
 *   - `compact`  (default) — small inline pill for list rows.
 *   - `detail`            — larger, glassy card for the property detail hero.
 *   - `avatar`            — initials-only chip for very dense contexts.
 */
export function ManagerBadge({ name, variant = 'compact', className }) {
  const { t } = useTranslation()
  const trimmed = String(name || '').trim()
  if (!trimmed) return null

  const initials = computeInitials(trimmed)
  const gradient = gradientFor(trimmed)
  const label = t('managerBadge.managedBy')

  if (variant === 'avatar') {
    return (
      <span
        title={`${label}: ${trimmed}`}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ring-2 ring-white',
          'bg-gradient-to-br',
          gradient,
          className,
        )}
      >
        {initials}
      </span>
    )
  }

  if (variant === 'detail') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm backdrop-blur',
          className,
        )}
      >
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-md ring-2 ring-white',
            'bg-gradient-to-br',
            gradient,
          )}
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
          <span className="text-sm font-extrabold text-slate-900">{trimmed}</span>
        </span>
      </div>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 ps-1 pe-3 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/60',
        className,
      )}
      title={`${label}: ${trimmed}`}
    >
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white',
          'bg-gradient-to-br',
          gradient,
        )}
        aria-hidden="true"
      >
        {initials}
      </span>
      <span className="truncate">{trimmed}</span>
    </span>
  )
}
