import { cn } from '../ui/cn'
import { useToast } from './ToastProvider'

function styles(type) {
  if (type === 'success') return 'bg-emerald-600 text-white'
  if (type === 'error') return 'bg-red-600 text-white'
  return 'bg-slate-900 text-white'
}

export function Toaster() {
  const { toasts, remove } = useToast()

  return (
    <div className="no-print pointer-events-none fixed left-4 top-4 z-50 flex w-[22rem] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto rounded-xl p-3 shadow-lg ring-1 ring-black/10',
            styles(t.type),
          )}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {t.title ? <div className="text-sm font-bold">{t.title}</div> : null}
              {t.message ? <div className="mt-1 text-sm opacity-95">{t.message}</div> : null}
            </div>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="rounded-md px-2 py-1 text-xs font-semibold opacity-90 hover:opacity-100"
            >
              إغلاق
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

