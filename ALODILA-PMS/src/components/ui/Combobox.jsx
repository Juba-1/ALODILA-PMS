import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from './cn'

export function Combobox({ label, value, onChange, options, placeholder, required }) {
  const { t, i18n } = useTranslation()
  const ph = placeholder ?? t('combobox.searchPh')
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef(null)

  const normalized = useMemo(() => {
    const list = options || []
    if (list.length > 0 && typeof list[0] === 'object' && list[0] !== null && 'value' in list[0]) {
      return list.map((o) => ({ value: String(o.value), label: String(o.label) }))
    }
    return list.map((o) => ({ value: String(o), label: String(o) }))
  }, [options])

  const selectedLabel = useMemo(() => {
    const v = value ? String(value) : ''
    if (!v) return ''
    return normalized.find((o) => o.value === v)?.label || v
  }, [normalized, value])

  const filtered = useMemo(() => {
    const needle = q.trim()
    if (!needle) return normalized
    return normalized.filter((o) => o.label.includes(needle))
  }, [normalized, q])

  useEffect(() => {
    function onDoc(e) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      {label ? <div className="mb-1 text-sm font-semibold text-slate-800">{label}</div> : null}

      {required ? <input tabIndex={-1} className="absolute h-0 w-0 opacity-0" value={value || ''} readOnly required /> : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/25',
        )}
      >
        <span className={cn('truncate', value ? 'text-slate-800' : 'text-slate-400')}>
          {value ? selectedLabel : t('combobox.select')}
        </span>
        <span className="text-slate-400">▾</span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
          <div className="p-2">
            <input
              dir={dir}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={ph}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-start text-sm text-slate-800 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            />
          </div>
          <div className="max-h-56 overflow-auto p-1">
            {normalized.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">{t('combobox.noOptions')}</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">{t('combobox.noResults')}</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-800 hover:bg-slate-50',
                    o.value === value ? 'bg-slate-50 font-bold' : '',
                  )}
                  onClick={() => {
                    onChange?.(o.value)
                    setOpen(false)
                    setQ('')
                  }}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value ? <span className="text-amber-500">✓</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
