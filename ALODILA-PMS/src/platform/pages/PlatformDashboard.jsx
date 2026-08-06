import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { PlatformPageHeader } from '../components/PlatformPageHeader.jsx'
import { CompanyStatusBadge } from '../components/CompanyStatusBadge.jsx'
import { useCompanyStats } from '../hooks/useCompanyStats.js'
import { formatCompanyDate } from '../lib/companyFormat.js'

function StatCard({ label, value }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-600">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-extrabold tabular-nums text-slate-900">{value ?? '—'}</div>
      </CardContent>
    </Card>
  )
}

export default function PlatformDashboard() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const { stats, recent, loading, error, reload } = useCompanyStats()

  return (
    <div>
      <PlatformPageHeader
        title={t('platform.dashboard.title')}
        subtitle={t('platform.dashboard.subtitle')}
        actions={
          <Link to="/platform/companies/new">
            <Button variant="gold">{t('platform.actions.create')}</Button>
          </Link>
        }
      />

      {loading ? <div className="text-sm text-slate-600">{t('platform.common.loading')}</div> : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div>{t('platform.companies.loadError')}</div>
          <Button className="mt-3" variant="subtle" size="sm" onClick={() => void reload()}>
            {t('platform.common.retry')}
          </Button>
        </div>
      ) : null}

      {!loading && !error && stats ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label={t('platform.dashboard.total')} value={stats.total} />
            <StatCard label={t('platform.dashboard.active')} value={stats.active} />
            <StatCard label={t('platform.dashboard.suspended')} value={stats.suspended} />
            <StatCard label={t('platform.dashboard.trial')} value={stats.trial} />
            <StatCard label={t('platform.dashboard.paid')} value={stats.paid} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('platform.stats.properties')} value={stats.properties} />
            <StatCard label={t('platform.stats.units')} value={stats.units} />
            <StatCard label={t('platform.stats.contracts')} value={stats.contracts} />
            <StatCard label={t('platform.stats.owners')} value={stats.owners} />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-extrabold text-slate-900">{t('platform.dashboard.recent')}</h2>
              <Link to="/platform/companies">
                <Button variant="subtle" size="sm">
                  {t('platform.dashboard.viewAll')}
                </Button>
              </Link>
            </div>

            {!recent?.length ? (
              <EmptyState icon="🏢" title={t('platform.dashboard.emptyRecent')} />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colName')}</th>
                      <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colStatus')}</th>
                      <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colPlan')}</th>
                      <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colCreated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-semibold">
                          <Link className="hover:underline" to={`/platform/companies/${row.id}`}>
                            {row.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <CompanyStatusBadge status={row.status} label={t(`platform.status.${row.status}`)} />
                        </td>
                        <td className="px-4 py-3">{row.plan ? t(`platform.plan.${row.plan}`) : '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{formatCompanyDate(row.created_at, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
