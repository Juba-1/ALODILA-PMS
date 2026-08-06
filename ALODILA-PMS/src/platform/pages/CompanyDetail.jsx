import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { PlatformPageHeader } from '../components/PlatformPageHeader.jsx'
import { CompanyLifecycleActions } from '../components/CompanyLifecycleActions.jsx'
import { ProtectedCompanyNotice } from '../components/ProtectedCompanyNotice.jsx'
import { CompanyAuthPanel } from '../components/CompanyAuthPanel.jsx'
import { CompanyStatusBadge } from '../components/CompanyStatusBadge.jsx'
import { useCompanyDetail } from '../hooks/useCompanyDetail.js'
import { isProtectedCompany } from '../lib/protectedCompanies.js'
import { formatCompanyDate } from '../lib/companyFormat.js'
import { getCompanyPortfolioStats } from '../services/companies.js'
import { getCompanyAuthProfile } from '../services/companyAuth.js'
import { cn } from '../../components/ui/cn.js'

const TABS = ['info', 'auth', 'stats']

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-bold tabular-nums text-slate-900">{value ?? '—'}</span>
    </div>
  )
}

export default function CompanyDetail() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const locale = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const { company, loading, error, reload } = useCompanyDetail(id)
  const protectedCompany = isProtectedCompany(company)
  const [tab, setTab] = useState('info')
  const [stats, setStats] = useState(null)
  const [authExtra, setAuthExtra] = useState({ lastLogin: null })

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!company?.id) return
      try {
        const portfolio = await getCompanyPortfolioStats(company.id)
        if (!cancelled) setStats(portfolio)
      } catch {
        if (!cancelled) setStats(null)
      }
      if (company.auth_user_id) {
        try {
          const auth = await getCompanyAuthProfile(company.auth_user_id)
          if (!cancelled) setAuthExtra({ lastLogin: auth?.last_sign_in_at || null, email: auth?.email || null })
        } catch {
          if (!cancelled) setAuthExtra({ lastLogin: null })
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [company?.id, company?.auth_user_id])

  return (
    <div>
      <PlatformPageHeader
        title={company?.name || t('platform.detail.title')}
        subtitle={t('platform.detail.title')}
        actions={
          <div className="flex flex-wrap gap-2">
            {company && !company.is_deleted ? (
              <Link to={`/platform/companies/${company.id}/edit`}>
                <Button variant="gold">{t('platform.actions.edit')}</Button>
              </Link>
            ) : null}
            <Link to="/platform/companies">
              <Button variant="subtle">{t('platform.detail.back')}</Button>
            </Link>
          </div>
        }
      />

      {loading ? <div className="text-sm text-slate-600">{t('platform.common.loading')}</div> : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div>{t('platform.detail.loadError')}</div>
          <Button className="mt-3" variant="subtle" size="sm" onClick={() => void reload()}>
            {t('platform.common.retry')}
          </Button>
        </div>
      ) : null}

      {!loading && !error && !company ? (
        <EmptyState icon="🔍" title={t('platform.detail.notFound')} description={id ? String(id) : undefined}>
          <Link to="/platform/companies">
            <Button variant="gold">{t('platform.detail.back')}</Button>
          </Link>
        </EmptyState>
      ) : null}

      {!loading && !error && company ? (
        <div className="space-y-4">
          {protectedCompany ? <ProtectedCompanyNotice /> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <CompanyLifecycleActions company={company} onChanged={() => void reload()} />
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition',
                  tab === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                )}
              >
                {t(`platform.detail.tabs.${key}`)}
              </button>
            ))}
          </div>

          {tab === 'info' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('platform.detail.tabs.info')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <StatRow label={t('platform.detail.fields.name')} value={company.name} />
                <StatRow label={t('platform.detail.fields.slug')} value={company.slug} />
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2">
                  <span className="text-sm text-slate-600">{t('platform.detail.fields.status')}</span>
                  <CompanyStatusBadge status={company.status} label={t(`platform.status.${company.status}`)} />
                </div>
                <StatRow
                  label={t('platform.detail.fields.plan')}
                  value={company.plan ? t(`platform.plan.${company.plan}`) : '—'}
                />
                <StatRow label={t('platform.detail.fields.created')} value={formatCompanyDate(company.created_at, locale)} />
                <div>
                  <div className="text-sm text-slate-600">{t('platform.detail.fields.notes')}</div>
                  <div className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-slate-800">
                    {company.notes_body || '—'}
                  </div>
                </div>
                <Link to={`/platform/companies/${company.id}/edit`}>
                  <Button variant="gold">{t('platform.actions.edit')}</Button>
                </Link>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'auth' ? (
            <CompanyAuthPanel company={company} locale={locale} onChanged={() => void reload()} />
          ) : null}

          {tab === 'stats' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('platform.detail.tabs.stats')}</CardTitle>
              </CardHeader>
              <CardContent>
                <StatRow label={t('platform.stats.properties')} value={stats?.properties} />
                <StatRow label={t('platform.stats.units')} value={stats?.units} />
                <StatRow label={t('platform.stats.owners')} value={stats?.owners} />
                <StatRow label={t('platform.stats.tenants')} value={stats?.tenants} />
                <StatRow label={t('platform.stats.contracts')} value={stats?.contracts} />
                <StatRow label={t('platform.stats.payments')} value={stats?.payments} />
                <StatRow label={t('platform.stats.maintenance')} value={stats?.maintenance} />
                <StatRow label={t('platform.auth.lastLogin')} value={formatCompanyDate(authExtra.lastLogin, locale)} />
                <StatRow label={t('platform.stats.activeUsers')} value="—" />
                <StatRow label={t('platform.stats.lastActivity')} value="—" />
                <StatRow label={t('platform.stats.storageUsage')} value="—" />
                <StatRow label={t('platform.stats.databaseSize')} value="—" />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
