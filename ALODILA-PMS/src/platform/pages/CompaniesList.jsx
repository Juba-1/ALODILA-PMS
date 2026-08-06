import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { Input, Label } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { PlatformPageHeader } from '../components/PlatformPageHeader.jsx'
import { CompaniesTable } from '../components/CompaniesTable.jsx'
import { useCompaniesList } from '../hooks/useCompaniesList.js'
import { COMPANY_STATUSES } from '../lib/constants.js'
import { COMPANY_PLANS } from '../lib/companyPlan.js'

const PAGE_SIZE = 10

export default function CompaniesList() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language?.startsWith('en') ? 'en' : 'ar'

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [plan, setPlan] = useState('')
  const [page, setPage] = useState(0)

  const { rows, loading, error, reload } = useCompaniesList({ q, status, plan, includeDeleted: false })

  const pageCount = Math.max(1, Math.ceil((rows?.length || 0) / PAGE_SIZE))
  const pageRows = useMemo(() => {
    const start = page * PAGE_SIZE
    return (rows || []).slice(start, start + PAGE_SIZE)
  }, [rows, page])

  return (
    <div>
      <PlatformPageHeader
        title={t('platform.companies.title')}
        subtitle={t('platform.companies.subtitle')}
        actions={
          <Link to="/platform/companies/new">
            <Button variant="gold">{t('platform.actions.create')}</Button>
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Label htmlFor="platform-company-q">{t('platform.companies.searchPlaceholder')}</Label>
          <Input
            id="platform-company-q"
            value={q}
            onChange={(e) => {
              setPage(0)
              setQ(e.target.value)
            }}
            placeholder={t('platform.companies.searchPlaceholder')}
          />
        </div>
        <div>
          <Label htmlFor="platform-company-status">{t('platform.companies.filterStatus')}</Label>
          <Select
            id="platform-company-status"
            value={status}
            onChange={(e) => {
              setPage(0)
              setStatus(e.target.value)
            }}
          >
            <option value="">{t('platform.companies.filterAllStatuses')}</option>
            {COMPANY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`platform.status.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="platform-company-plan">{t('platform.companies.filterPlan')}</Label>
          <Select
            id="platform-company-plan"
            value={plan}
            onChange={(e) => {
              setPage(0)
              setPlan(e.target.value)
            }}
          >
            <option value="">{t('platform.companies.filterAllPlans')}</option>
            {COMPANY_PLANS.map((p) => (
              <option key={p} value={p}>
                {t(`platform.plan.${p}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <Button variant="subtle" className="w-full" onClick={() => void reload()}>
            {t('platform.companies.refresh')}
          </Button>
        </div>
      </div>

      {loading ? <div className="text-sm text-slate-600">{t('platform.common.loading')}</div> : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {t('platform.companies.loadError')}
        </div>
      ) : null}

      {!loading && !error && !rows.length ? (
        <EmptyState icon="🏢" title={t('platform.companies.empty')} />
      ) : null}

      {!loading && !error && rows.length ? (
        <>
          <CompaniesTable rows={pageRows} locale={locale} />
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600">
            <div>
              {t('platform.companies.pageOf', {
                page: page + 1,
                pages: pageCount,
                total: rows.length,
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="subtle" size="sm" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                {t('platform.companies.prev')}
              </Button>
              <Button
                variant="subtle"
                size="sm"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                {t('platform.companies.next')}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
