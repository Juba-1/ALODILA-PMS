import { useTranslation } from 'react-i18next'
import { cn } from '../ui/cn'
import { useToast } from './ToastProvider'

function styles(type) {
  if (type === 'success') return 'bg-emerald-600 text-white'
  if (type === 'error') return 'bg-red-600 text-white'
  return 'bg-slate-900 text-white'
}

export function Toaster() {
  const { t } = useTranslation()
  const { toasts, remove } = useToast()

  return (
    <div className="no-print pointer-events-none fixed top-4 start-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto rounded-xl p-3 shadow-lg ring-1 ring-black/10',
            styles(toast.type),
          )}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {toast.title ? <div className="text-sm font-bold">{toast.title}</div> : null}
              {toast.message ? <div className="mt-1 text-sm opacity-95">{toast.message}</div> : null}
            </div>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              className="rounded-md px-2 py-1 text-xs font-semibold opacity-90 hover:opacity-100"
              aria-label={t('common.close')}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

