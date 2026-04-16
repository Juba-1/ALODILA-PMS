import { cn } from './cn'

export function Card({ className, ...props }) {
  return (
    <div
      className={cn('rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-900/5', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('border-b border-slate-200 px-5 py-4', className)} {...props} />
}

export function CardTitle({ className, ...props }) {
  return <div className={cn('text-base font-bold text-slate-800', className)} {...props} />
}

export function CardDescription({ className, ...props }) {
  return <div className={cn('mt-1 text-sm text-slate-500', className)} {...props} />
}

export function CardContent({ className, ...props }) {
  return <div className={cn('px-5 py-5', className)} {...props} />
}
