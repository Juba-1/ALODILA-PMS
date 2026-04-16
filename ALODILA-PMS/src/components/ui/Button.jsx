import { cn } from './cn'

function Spinner({ className }) {
  return (
    <svg className={cn('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

export function Button({ variant = 'primary', size = 'md', className, loading, children, disabled, ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:opacity-60 disabled:pointer-events-none'

  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800',
    gold: 'bg-amber-500 text-slate-900 hover:bg-amber-400',
    ghost: 'bg-transparent text-slate-800 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    subtle: 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50',
  }

  const sizes = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-5 text-base',
  }

  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}
