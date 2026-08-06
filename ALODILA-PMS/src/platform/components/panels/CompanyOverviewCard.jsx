import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card.jsx'
import { CompanyStatusBadge } from '../CompanyStatusBadge.jsx'
import { DetailField } from './DetailField.jsx'

/**
 * High-level identity overview (name / notes / soft-delete). Metadata lives in PlatformInfoPanel.
 */
export function CompanyOverviewCard({ company }) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{company.name}</CardTitle>
        <CompanyStatusBadge status={company.status} label={t(`platform.status.${company.status}`, company.status)} />
      </CardHeader>
      <CardContent>
        <DetailField label={t('platform.detail.fields.name')}>{company.name}</DetailField>
        <DetailField label={t('platform.detail.fields.deleted')}>
          {company.is_deleted ? t('platform.detail.yes') : t('platform.detail.no')}
        </DetailField>
        <DetailField label={t('platform.detail.fields.notes')}>{company.notes || '—'}</DetailField>
      </CardContent>
    </Card>
  )
}
