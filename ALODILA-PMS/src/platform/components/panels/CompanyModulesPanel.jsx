import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card.jsx'
import { listModuleEntries } from '../../extensions/flags/companyModules.js'

/**
 * Read-only / disabled feature-flag switches for future company modules.
 */
export function CompanyModulesPanel({ companyId }) {
  const { t } = useTranslation()
  const entries = listModuleEntries(companyId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('platform.modules.title')}</CardTitle>
        <CardDescription>{t('platform.modules.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-slate-100">
          {entries.map((entry) => {
            const label = t(`platform.modules.items.${entry.key}`)
            const inputId = `platform-module-${entry.key}`
            return (
              <li key={entry.key} className="flex items-center justify-between gap-3 py-3">
                <label htmlFor={inputId} className="text-sm font-semibold text-slate-800">
                  {label}
                </label>
                <input
                  id={inputId}
                  type="checkbox"
                  className="h-4 w-7 cursor-not-allowed accent-slate-400"
                  checked={entry.enabled}
                  disabled
                  readOnly
                  aria-disabled="true"
                  title={t('platform.modules.disabledTitle')}
                />
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500">{t('platform.modules.hint')}</p>
      </CardContent>
    </Card>
  )
}
