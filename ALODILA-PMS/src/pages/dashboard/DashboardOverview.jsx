import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n/config.js'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getDashboardStats, getProactiveAlerts, getRecentActivity } from '../../lib/db/dashboard'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { translateContractStatus, translateInvoicePaymentStatus } from '../../lib/i18n/domainLabels'

function UrgencyBadge({ level, t }) {
  const cfg =
    level === 'critical'
      ? { label: t('dashboardPage.urgencyCritical'), className: 'bg-rose-100 text-rose-900 ring-rose-200' }
      : level === 'high'
        ? { label: t('dashboardPage.urgencyHigh'), className: 'bg-amber-100 text-amber-950 ring-amber-200' }
        : { label: t('dashboardPage.urgencyMedium'), className: 'bg-sky-100 text-sky-900 ring-sky-200' }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold ring-1 ${cfg.className}`}>{cfg.label}</span>
  )
}

function contractUrgency(days) {
  if (days <= 7) return 'critical'
  if (days <= 14) return 'high'
  return 'medium'
}

function invoiceUrgency(days) {
  if (days >= 60) return 'critical'
  if (days >= 14) return 'high'
  return 'medium'
}

function StatCard({ title, value, hint }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-extrabold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}

function MoneyKpiCard({ title, invoiced, collected, outstanding, labels }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[11px] font-bold text-slate-500">{labels.invoiced}</div>
          <div className="mt-1 text-lg font-extrabold text-slate-900">{invoiced}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <div className="text-[11px] font-bold text-emerald-700">{labels.collected}</div>
          <div className="mt-1 text-lg font-extrabold text-emerald-900">{collected}</div>
        </div>
        <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <div className="text-[11px] font-bold text-amber-800">{labels.outstanding}</div>
          <div className="mt-1 text-lg font-extrabold text-amber-950">{outstanding}</div>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">{labels.formulaHint}</div>
    </div>
  )
}

function HealthTone(pct) {
  if (!Number.isFinite(pct)) return { band: 'bg-slate-200', bar: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700' }
  if (pct >= 85) return { band: 'bg-emerald-100', bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800' }
  if (pct >= 60) return { band: 'bg-amber-100', bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-900' }
  return { band: 'bg-rose-100', bar: 'bg-rose-500', chip: 'bg-rose-100 text-rose-800' }
}

function PercentKpi({ title, pct, hint, healthLabels }) {
  const clamped = Number.isFinite(pct) ? Math.max(0, Math.min(100, Number(pct))) : 0
  const tone = HealthTone(clamped)
  const label = clamped >= 85 ? healthLabels.high : clamped >= 60 ? healthLabels.ok : healthLabels.low
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-500">{title}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-3xl font-black text-slate-900 tabular-nums">{clamped.toFixed(1)}%</div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ring-1 ring-inset ring-black/5 ${tone.chip}`}>
              {label}
            </span>
          </div>
          {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
        </div>
      </div>
      <div className={`mt-3 h-2 w-full overflow-hidden rounded-full ${tone.band}`}>
        <div
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          className={`h-full rounded-full ${tone.bar} transition-[width] duration-700 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

function PendingMaintenanceKpi({ title, amountSar, count, hint }) {
  const n = Number(count || 0)
  const tone = n === 0 ? 'bg-emerald-50 ring-emerald-200 text-emerald-900' : 'bg-amber-50 ring-amber-200 text-amber-900'
  return (
    <div className={`rounded-2xl p-5 shadow-sm ring-1 ${tone}`}>
      <div className="text-xs font-bold opacity-80">{title}</div>
      <div className="mt-2 text-2xl font-black tabular-nums">{Number(amountSar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div className="mt-1 text-[11px] font-bold opacity-75">{hint}</div>
    </div>
  )
}

export default function DashboardOverview() {
  const { t, i18n: i18nInst } = useTranslation()
  const lang = i18nInst.language?.startsWith('en') ? 'en' : 'ar'
  const { push } = useToastDispatch()
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const navigate = useNavigate()
  const [busy, setBusy] = useState(true)
  const [stats, setStats] = useState(null)
  const [recentContracts, setRecentContracts] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [alerts, setAlerts] = useState({ expiringContracts: [], overdueInvoices: [] })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const [s, r, a] = await Promise.all([getDashboardStats(), getRecentActivity(), getProactiveAlerts()])
        if (cancelled) return
        setStats(s)
        setRecentContracts(r.recentContracts)
        setRecentPayments(r.recentPayments)
        setAlerts(a)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure((p) => toastPushRef.current?.(p), e, i18n.t('dashboardPage.toastLoadFailed'), true)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="relative space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboardPage.execTitle')}</CardTitle>
          <CardDescription>{t('dashboardPage.execSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard title={t('dashboardPage.statProperties')} value={stats.propertiesCount} />
              <StatCard title={t('dashboardPage.statUnits')} value={stats.unitsCount} />
              <StatCard title={t('dashboardPage.statActiveContracts')} value={stats.activeContractsCount} />
              <StatCard
                title={t('dashboardPage.statRevenue')}
                value={Number(stats.totalRevenue || 0).toFixed(2)}
                hint={t('dashboardPage.statRevenueHint')}
              />

              <div className="lg:col-span-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <PercentKpi
                  title={t('dashboardPage.kpiOccupancyTitle')}
                  pct={stats?.kpi?.occupancyPct ?? 0}
                  hint={t('dashboardPage.kpiOccupancyHint', {
                    rented: stats?.unitsBreakdown?.rented ?? 0,
                    total: stats?.unitsCount ?? 0,
                  })}
                  healthLabels={t('dashboardPage.kpiHealth', { returnObjects: true })}
                />
                <PercentKpi
                  title={t('dashboardPage.kpiCollectionTitle')}
                  pct={stats?.kpi?.collectionPct ?? 0}
                  hint={t('dashboardPage.kpiCollectionHint')}
                  healthLabels={t('dashboardPage.kpiHealth', { returnObjects: true })}
                />
                <PendingMaintenanceKpi
                  title={t('dashboardPage.kpiPendingMaintTitle')}
                  amountSar={stats?.kpi?.pendingMaintenanceSar ?? '0.00'}
                  count={stats?.kpi?.pendingMaintenanceCount ?? 0}
                  hint={t('dashboardPage.kpiPendingMaintHint', { count: stats?.kpi?.pendingMaintenanceCount ?? 0 })}
                />
              </div>

              <div className="lg:col-span-4">
                <MoneyKpiCard
                  title={t('kpiCollection.title')}
                  invoiced={stats?.kpi?.totalInvoicedSar ?? '0.00'}
                  collected={stats?.kpi?.totalCollectedSar ?? '0.00'}
                  outstanding={stats?.kpi?.outstandingSar ?? '0.00'}
                  labels={{
                    invoiced: t('kpiCollection.invoiced'),
                    collected: t('kpiCollection.collected'),
                    outstanding: t('kpiCollection.outstanding'),
                    formulaHint: t('kpiCollection.formulaHint'),
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              {t('dashboardPage.statsLoadError')}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboardPage.alertsTitle')}</CardTitle>
          <CardDescription>{t('dashboardPage.alertsSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-slate-900">{t('dashboardPage.expiringTitle')}</div>
                  <Link to="/company/contracts" className="text-xs font-semibold text-slate-900 hover:underline">
                    {t('dashboardPage.contractsLink')}
                  </Link>
                </div>
                {alerts.expiringContracts.length === 0 ? (
                  <div className="text-sm text-slate-500">{t('dashboardPage.expiringEmpty')}</div>
                ) : (
                  <ul className="space-y-2">
                    {alerts.expiringContracts.map((c) => (
                      <li key={c.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 text-sm font-bold text-slate-900">
                            {c.tenant_full_name || '—'} — {c.unit_name || '—'}
                          </div>
                          <UrgencyBadge level={contractUrgency(c.days_until_end)} t={t} />
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {c.property_name ? `${c.property_name} — ` : ''}
                          {t('dashboardPage.contractEnds')} {c.end_date} — {t('dashboardPage.daysRemaining', { count: c.days_until_end })}
                          {c.ejar_contract_number ? t('dashboardPage.ejarSuffix', { num: c.ejar_contract_number }) : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-slate-900">{t('dashboardPage.overdueTitle')}</div>
                  <Link to="/company/finance" className="text-xs font-semibold text-slate-900 hover:underline">
                    {t('dashboardPage.financeLink')}
                  </Link>
                </div>
                {alerts.overdueInvoices.length === 0 ? (
                  <div className="text-sm text-slate-500">{t('dashboardPage.overdueEmpty')}</div>
                ) : (
                  <ul className="space-y-2">
                    {alerts.overdueInvoices.map((inv) => (
                      <li key={inv.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 text-sm font-bold text-slate-900">
                            {inv.tenant_full_name || '—'} — {inv.unit_name || '—'}
                          </div>
                          <UrgencyBadge level={invoiceUrgency(inv.days_overdue)} t={t} />
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {inv.property_name ? `${inv.property_name} — ` : ''}
                          {t('dashboardPage.dueLabel')} {inv.due_date} —{' '}
                          {t('dashboardPage.overdueDays', { count: inv.days_overdue })} —{' '}
                          {t('dashboardPage.statusLabel')}:{' '}
                          {translateInvoicePaymentStatus(inv.payment_status, lang)} —{' '}
                          {t('dashboardPage.amountLabel')} {Number(inv.total_amount || 0).toFixed(2)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboardPage.recentContractsTitle')}</CardTitle>
            <CardDescription>{t('dashboardPage.recentContractsSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {busy ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : recentContracts.length === 0 ? (
              <div className="text-sm text-slate-500">{t('dashboardPage.noRows')}</div>
            ) : (
              <div className="space-y-3">
                {recentContracts.map((c) => (
                  <div key={c.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="text-sm font-bold text-slate-900">
                      {c.tenant_full_name || '-'} — {c.unit_name || '-'}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {t('dashboardPage.fromTo', { start: c.start_date, end: c.end_date })} —{' '}
                      {t('dashboardPage.statusLine', { status: translateContractStatus(c.status, lang) })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboardPage.recentPaymentsTitle')}</CardTitle>
            <CardDescription>{t('dashboardPage.recentPaymentsSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {busy ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : recentPayments.length === 0 ? (
              <div className="text-sm text-slate-500">{t('dashboardPage.noRows')}</div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((p) => (
                  <div key={p.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-900">
                          {p.tenant_full_name || '-'} — {p.unit_name || '-'}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">{t('dashboardPage.paymentDate', { date: p.payment_date })}</div>
                      </div>
                      <div className="text-sm font-extrabold text-slate-900">{Number(p.amount || 0).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="no-print sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur">
        <Button variant="subtle" onClick={() => navigate('/company/finance')}>
          {t('dashboardPage.issueInvoice')}
        </Button>
        <Button variant="gold" onClick={() => navigate('/company/properties/new')}>
          {t('dashboardPage.addProperty')}
        </Button>
      </div>
    </div>
  )
}
