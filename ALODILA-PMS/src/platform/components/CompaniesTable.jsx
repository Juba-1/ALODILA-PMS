import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { CompanyStatusBadge } from './CompanyStatusBadge.jsx'
import { formatCompanyDate } from '../lib/companyFormat.js'

function dash(v) {
  if (v == null || v === '') return '—'
  return v
}

export function CompaniesTable({ rows, locale }) {
  const { t } = useTranslation()

  if (!rows?.length) return null

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colName')}</th>
            <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colStatus')}</th>
            <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colPlan')}</th>
            <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colLoginEmail')}</th>
            <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colLastLogin')}</th>
            <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colProperties')}</th>
            <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colContracts')}</th>
            <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colCreated')}</th>
            <th className="px-4 py-3 text-start font-bold">{t('platform.companies.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
              <td className="px-4 py-3 font-semibold text-slate-900">
                <Link className="underline-offset-2 hover:underline" to={`/platform/companies/${row.id}`}>
                  {row.name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <CompanyStatusBadge status={row.status} label={t(`platform.status.${row.status}`, row.status)} />
              </td>
              <td className="px-4 py-3 text-slate-700">
                {row.plan ? t(`platform.plan.${row.plan}`, row.plan) : '—'}
              </td>
              <td className="px-4 py-3 text-slate-700">{dash(row.login_email)}</td>
              <td className="px-4 py-3 text-slate-600">{formatCompanyDate(row.last_login_at, locale)}</td>
              <td className="px-4 py-3 tabular-nums text-slate-800">{row.properties_count ?? '—'}</td>
              <td className="px-4 py-3 tabular-nums text-slate-800">{row.contracts_count ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">{formatCompanyDate(row.created_at, locale)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <Link to={`/platform/companies/${row.id}`}>
                    <Button size="sm" variant="subtle">
                      {t('platform.actions.view')}
                    </Button>
                  </Link>
                  {!row.is_deleted ? (
                    <Link to={`/platform/companies/${row.id}/edit`}>
                      <Button size="sm" variant="gold">
                        {t('platform.actions.edit')}
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
