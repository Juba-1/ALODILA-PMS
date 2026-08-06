import { useTranslation } from 'react-i18next'

export function ProtectedCompanyNotice() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800"
    >
      <div className="font-bold">{t('platform.protected.title')}</div>
      <p className="mt-1 text-slate-700">{t('platform.protected.body')}</p>
    </div>
  )
}
