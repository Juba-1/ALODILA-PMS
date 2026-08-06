import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import { getTenantStatement } from '../../lib/db/tenantStatement'
import { centsToMoneyString } from '../../lib/money/cents'
import { ALODILA_LOGO_URL } from '../../lib/brand/logoUrl'

function money(cents) {
  return centsToMoneyString(cents || 0)
}

export default function TenantStatement() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { push } = useToastDispatch()
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const tRef = useRef(t)
  tRef.current = t

  const [busy, setBusy] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const res = await getTenantStatement(id)
        if (!cancelled) setData(res)
      } catch (e) {
        if (!cancelled) reportLoadFailure((p) => toastPushRef.current?.(p), e, tRef.current('tenantStatement.loadFail'), true)
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const rows = data?.entries || []

  const title = useMemo(() => t('tenantStatement.title'), [t])

  return (
    <div className="max-w-5xl space-y-4 statement-root">
      <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-extrabold text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-500">
            <Link to="/company/tenants" className="font-semibold text-slate-900 hover:underline">
              {t('tenantStatement.tenantsLink')}
            </Link>{' '}
            / {t('tenantStatement.breadcrumb')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" onClick={() => window.print()} disabled={busy}>
            {t('tenantStatement.printPdf')}
          </Button>
          <Link to="/company/tenants">
            <Button variant="ghost">{t('tenantStatement.back')}</Button>
          </Link>
        </div>
      </div>

      <Card className="statement-doc">
        <CardHeader>
          <CardTitle>{t('tenantStatement.pageTitle')}</CardTitle>
          <CardDescription>{t('tenantStatement.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : !data ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{t('tenantStatement.noData')}</div>
          ) : (
            <>
              <div className="print-only statement-print-header">
                <img src={ALODILA_LOGO_URL} alt="ALODILA" className="statement-logo" referrerPolicy="no-referrer" />
                <div className="statement-header-text">
                  <div className="statement-brand">{t('tenantStatement.brand')}</div>
                  <div className="statement-title">{t('tenantStatement.pageTitle')}</div>
                  <div className="statement-meta">
                    <div>{t('tenantStatement.headerDate')} {new Date().toISOString().slice(0, 10)}</div>
                    <div>{t('tenantStatement.headerTenant')} {data.tenant.full_name}</div>
                    <div>{t('tenantStatement.headerId')} {data.tenant.national_id_or_cr}</div>
                    <div>{t('tenantStatement.headerPhone')} {data.tenant.phone}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-bold text-slate-500">{t('tenantStatement.totalDebits')}</div>
                  <div className="mt-1 text-xl font-extrabold text-slate-900">{money(data.totals.total_debits_cents)}</div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                  <div className="text-xs font-bold text-emerald-700">{t('tenantStatement.totalCredits')}</div>
                  <div className="mt-1 text-xl font-extrabold text-emerald-900">{money(data.totals.total_credits_cents)}</div>
                </div>
                <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <div className="text-xs font-bold text-amber-800">{t('tenantStatement.outstanding')}</div>
                  <div className="mt-1 text-xl font-extrabold text-amber-950">{money(data.totals.outstanding_cents)}</div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm statement-table">
                    <thead className="bg-slate-50">
                      <tr className="text-start text-xs font-extrabold text-slate-700">
                        <th className="px-4 py-3">{t('tenantStatement.colDate')}</th>
                        <th className="px-4 py-3">{t('tenantStatement.colDescription')}</th>
                        <th className="px-4 py-3">{t('tenantStatement.colRef')}</th>
                        <th className="px-4 py-3">{t('tenantStatement.colDebit')}</th>
                        <th className="px-4 py-3">{t('tenantStatement.colCredit')}</th>
                        <th className="px-4 py-3">{t('tenantStatement.colBalance')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                            {t('tenantStatement.empty')}
                          </td>
                        </tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={`${r.kind}-${r.id}`} className="border-t border-slate-100">
                            <td className="px-4 py-3 text-slate-700">{r.date}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">{r.description}</td>
                            <td className="px-4 py-3 font-mono text-[12px] text-slate-600">{String(r.ref || '').slice(0, 8)}</td>
                            <td className="px-4 py-3 text-slate-800">{r.debit_cents ? money(r.debit_cents) : '—'}</td>
                            <td className="px-4 py-3 text-slate-800">{r.credit_cents ? money(r.credit_cents) : '—'}</td>
                            <td className="px-4 py-3 font-extrabold text-slate-900">{money(r.balance_cents)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                {t('tenantStatement.auditNote')}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
