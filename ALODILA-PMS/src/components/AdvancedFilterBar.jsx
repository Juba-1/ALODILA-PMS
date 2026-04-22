import { useTranslation } from 'react-i18next'

export function AdvancedFilterBar({ title, children }) {
  const { t } = useTranslation()
  const finalTitle = title ?? t('reports.filterBarTitle')
  return (
    <div className="mb-4 rounded-2xl bg-gradient-to-l from-white to-slate-50 p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-extrabold tracking-wide text-slate-800">{finalTitle}</div>
        <div className="hidden text-[10px] font-bold text-slate-400 sm:block">Enterprise Filters</div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{children}</div>
    </div>
  )
}
