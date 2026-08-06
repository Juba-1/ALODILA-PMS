import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card.jsx'
import { DetailField } from './DetailField.jsx'
import { getSubscriptionSummary } from '../../extensions/subscription/subscriptionAccessors.js'

function displayOrDash(value) {
  if (value == null || value === '') return '—'
  return String(value)
}

/**
 * Read-only subscription placeholder panel.
 */
export function SubscriptionPanel({ companyId }) {
  const { t } = useTranslation()
  const summary = getSubscriptionSummary(companyId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('platform.subscription.title')}</CardTitle>
        <CardDescription>{t('platform.subscription.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailField label={t('platform.subscription.status')}>
          <span className="font-semibold">{t(`platform.subscription.statuses.${summary.status}`, summary.status)}</span>
        </DetailField>
        <DetailField label={t('platform.subscription.plan')}>{displayOrDash(summary.planLabel)}</DetailField>
        <DetailField label={t('platform.subscription.renewsAt')}>{displayOrDash(summary.renewsAt)}</DetailField>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-2 text-sm font-bold text-slate-800">{t('platform.subscription.limitsTitle')}</div>
          <DetailField label={t('platform.subscription.limits.users')}>{displayOrDash(summary.limits?.maxUsers)}</DetailField>
          <DetailField label={t('platform.subscription.limits.properties')}>
            {displayOrDash(summary.limits?.maxProperties)}
          </DetailField>
          <DetailField label={t('platform.subscription.limits.units')}>{displayOrDash(summary.limits?.maxUnits)}</DetailField>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-2 text-sm font-bold text-slate-800">{t('platform.subscription.billingTitle')}</div>
          <DetailField label={t('platform.subscription.billing.provider')}>
            {displayOrDash(summary.billing?.provider)}
          </DetailField>
          <DetailField label={t('platform.subscription.billing.customerId')}>
            {displayOrDash(summary.billing?.customerId)}
          </DetailField>
          <DetailField label={t('platform.subscription.billing.nextInvoice')}>
            {displayOrDash(summary.billing?.nextInvoiceAt)}
          </DetailField>
        </div>

        <p className="mt-4 text-xs text-slate-500">{t('platform.subscription.hint')}</p>
      </CardContent>
    </Card>
  )
}
