import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../../components/ui/Card.jsx'
import { PlatformPageHeader } from '../components/PlatformPageHeader.jsx'

/**
 * Stub surface for Platform Console sections not yet implemented.
 * @param {{ titleKey: string, subtitleKey?: string }} props
 */
export default function PlatformPlaceholder({ titleKey, subtitleKey = 'platform.common.comingSoonBody' }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <PlatformPageHeader title={t(titleKey)} subtitle={t(subtitleKey)} />
      <Card>
        <CardContent className="py-10 text-sm text-slate-600">{t('platform.common.comingSoon')}</CardContent>
      </Card>
    </div>
  )
}
