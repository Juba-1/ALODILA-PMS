import { cn } from './cn'

export function EmptyState({ icon = '📋', title, description, className, children }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <div className="mt-3 text-base font-bold text-slate-900">{title}</div>
      {description ? <div className="mt-2 max-w-md text-sm text-slate-600">{description}</div> : null}
      {children ? <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  )
}
