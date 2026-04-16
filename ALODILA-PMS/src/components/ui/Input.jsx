import { cn } from './cn'

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-right text-sm text-slate-800 placeholder:text-slate-400 transition-shadow focus:border-amber-500/80 focus:outline-none focus:ring-2 focus:ring-amber-400/35 disabled:bg-slate-50 disabled:text-slate-500',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }) {
  return <label className={cn('mb-1 block text-sm font-semibold text-slate-800', className)} {...props} />
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm text-slate-800 placeholder:text-slate-400 transition-shadow focus:border-amber-500/80 focus:outline-none focus:ring-2 focus:ring-amber-400/35 disabled:bg-slate-50 disabled:text-slate-500',
        className,
      )}
      {...props}
    />
  )
}
