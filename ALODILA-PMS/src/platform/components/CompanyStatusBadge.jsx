import { cn } from '../../components/ui/cn.js'

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
  suspended: 'bg-amber-100 text-amber-950 ring-amber-200',
  provisioning: 'bg-sky-100 text-sky-900 ring-sky-200',
}

export function CompanyStatusBadge({ status, label, className }) {
  const key = String(status || '')
  const style = STATUS_STYLES[key] || 'bg-slate-100 text-slate-800 ring-slate-200'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset',
        style,
        className,
      )}
    >
      {label || key || '—'}
    </span>
  )
}
