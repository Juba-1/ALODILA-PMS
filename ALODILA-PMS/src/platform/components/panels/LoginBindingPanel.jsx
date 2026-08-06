import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/ui/Button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card.jsx'
import { DetailField } from './DetailField.jsx'
import { isLoginBound, loginBindingLabel } from '../../lib/companyFormat.js'

/**
 * Read-only login binding placeholder — no Auth writes in Sprint 2.
 */
export function LoginBindingPanel({ company }) {
  const { t } = useTranslation()
  const bound = isLoginBound(company)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('platform.loginPanel.title')}</CardTitle>
        <CardDescription>{t('platform.loginPanel.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailField label={t('platform.loginPanel.state')}>{loginBindingLabel(company, t)}</DetailField>
        <DetailField label={t('platform.loginPanel.authUserId')}>
          {bound ? (
            <span className="break-all font-mono text-xs">{company.auth_user_id}</span>
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </DetailField>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="gold" disabled title={t('platform.loginPanel.bindDisabledTitle')}>
            {t('platform.loginPanel.bind')}
          </Button>
          <p className="text-xs text-slate-500">{t('platform.loginPanel.futureHint')}</p>
        </div>
      </CardContent>
    </Card>
  )
}
