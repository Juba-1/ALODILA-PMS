import { cn } from './cn'

export function Select({ className, ...props }) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-start text-sm text-slate-800 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/25 disabled:bg-slate-50 disabled:text-slate-500',
        className,
      )}
      {...props}
    />
  )
}
