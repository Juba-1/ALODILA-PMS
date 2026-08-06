import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card.jsx'
import { CompanyStatusBadge } from '../CompanyStatusBadge.jsx'
import { DetailField } from './DetailField.jsx'
import { formatCompanyDate } from '../../lib/companyFormat.js'

function provisioningLabel(company, t) {
  if (!company) return '—'
  if (company.is_deleted) return t('platform.info.provisioningStates.deleted')
  if (company.status === 'provisioning') return t('platform.info.provisioningStates.inProgress')
  if (company.status === 'suspended') return t('platform.info.provisioningStates.suspended')
  if (company.status === 'active') return t('platform.info.provisioningStates.ready')
  return t('platform.info.provisioningStates.unknown')
}

/**
 * Read-only platform metadata for a company.
 */
export function PlatformInfoPanel({ company, locale }) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('platform.info.title')}</CardTitle>
        <CardDescription>{t('platform.info.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailField label={t('platform.info.uuid')}>
          <span className="break-all font-mono text-xs">{company.id}</span>
        </DetailField>
        <DetailField label={t('platform.info.slug')}>
          <span className="font-mono text-xs">{company.slug}</span>
        </DetailField>
        <DetailField label={t('platform.info.status')}>
          <CompanyStatusBadge status={company.status} label={t(`platform.status.${company.status}`, company.status)} />
        </DetailField>
        <DetailField label={t('platform.info.provisioningLabel')}>{provisioningLabel(company, t)}</DetailField>
        <DetailField label={t('platform.info.created')}>{formatCompanyDate(company.created_at, locale)}</DetailField>
        <DetailField label={t('platform.info.updated')}>{formatCompanyDate(company.updated_at, locale)}</DetailField>
      </CardContent>
    </Card>
  )
}
