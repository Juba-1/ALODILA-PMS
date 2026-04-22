import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getContracts } from '../../lib/db/contracts'
import { getInvoices } from '../../lib/db/invoices'
import { getReportingMaintenance, getReportingPayments } from '../../lib/db/reports'
import { getUnitsInventory } from '../../lib/db/units'
import { buildNetRoiRowsByProperty } from '../../lib/finance/propertyNetIncome'
import { paymentStatusOfInvoice, remainingOnInvoice } from '../../lib/finance/invoiceDerived'
import { formatMoneyLocale } from '../../lib/format/moneyLocale'
import { translateInvoicePaymentStatus } from '../../lib/i18n/domainLabels'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { exportReportPdf } from '../../lib/print/targetedPdf'
import {
  buildAgingBuckets,
  buildExpectedVsCollected,
  buildLeaseExpiryForecast,
  buildMaintenanceByProperty,
  buildMonthlyCashflow,
  buildVatLedger,
  rangeTotals,
  todayIsoDate,
} from '../../lib/analytics/reportInsights'

/* ----------------------------- small helpers ----------------------------- */

function daysBetweenISO(fromDateStr, toDateStr) {
  const a = new Date(`${fromDateStr}T00:00:00`)
  const b = new Date(`${toDateStr}T00:00:00`)
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function normalizePhoneForWa(phone) {
  const raw = String(phone || '').trim()
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  if (digits.startsWith('00966')) return '966' + digits.slice(5)
  if (digits.startsWith('966')) return digits
  if (digits.startsWith('05') && digits.length >= 10) return '966' + digits.slice(1)
  return digits
}

function whatsappUrl(phone) {
  const n = normalizePhoneForWa(phone)
  return n ? `https://wa.me/${n}` : null
}

function monthKeyFromTs(ts) {
  const s = String(ts || '')
  return s.length >= 7 ? s.slice(0, 7) : ''
}

const CHART_COLORS = {
  primary: '#f59e0b',
  primarySoft: '#fde68a',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f97316',
  neutral: '#64748b',
  deep: '#0f172a',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
}

/* ------------------------------ page shell ------------------------------ */

export default function ReportsCenter() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const dir = lang === 'en' ? 'ltr' : 'rtl'
  const { push } = useToastDispatch()
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const tRef = useRef(t)
  tRef.current = t
  const [busy, setBusy] = useState(true)

  const [payments, setPayments] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [invoices, setInvoices] = useState([])
  const [units, setUnits] = useState([])
  const [contracts, setContracts] = useState([])

  /* Global filter bar — defaults to YTD */
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  })
  const [dateTo, setDateTo] = useState(todayIsoDate)
  const [propertyFilter, setPropertyFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [vatRatePct, setVatRatePct] = useState(15)

  /* OPEX (existing) section keeps its own date filters for drill-down */
  const [opexFrom, setOpexFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  })
  const [opexTo, setOpexTo] = useState(todayIsoDate)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const [p, m, inv, u, c] = await Promise.all([
          getReportingPayments(),
          getReportingMaintenance(),
          getInvoices(),
          getUnitsInventory(),
          getContracts(),
        ])
        if (cancelled) return
        setPayments(p)
        setMaintenance(m)
        setInvoices(inv)
        setUnits(u)
        setContracts(c)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure((payload) => toastPushRef.current?.(payload), e, tRef.current('errors.loadReports'), true)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* ------------------------------ derived ------------------------------ */

  const propertyOptions = useMemo(() => {
    const map = new Map()
    for (const u of units || []) {
      const pid = u.property_id || u?.property?.id
      if (!pid) continue
      const name = u.property_name || u?.property?.name || ''
      if (!map.has(pid)) map.set(pid, name)
    }
    for (const p of payments || []) {
      if (p.property_id && !map.has(p.property_id)) map.set(p.property_id, p.property_name || '')
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [units, payments])

  const filterCtx = { fromIso: dateFrom, toIso: dateTo, propertyId: propertyFilter }

  /**
   * Apply the global status filter (invoice/contract life-cycle) to a list of invoices.
   * - `all` is a pass-through.
   * - `overdue` keeps anything with remaining balance and due_date < today.
   * - `unpaid` / `partial` / `paid` match the derived payment-status in Arabic (DB canonical).
   */
  const filteredInvoices = useMemo(() => {
    if (!statusFilter || statusFilter === 'all') return invoices
    const today = todayIsoDate()
    return (invoices || []).filter((inv) => {
      const st = paymentStatusOfInvoice(inv)
      if (statusFilter === 'paid') return st === 'مدفوعة بالكامل'
      if (statusFilter === 'partial') return st === 'مدفوعة جزئياً'
      if (statusFilter === 'unpaid') return st === 'غير مدفوعة'
      if (statusFilter === 'overdue') {
        if (st === 'مدفوعة بالكامل') return false
        if (!inv.due_date) return false
        return String(inv.due_date) < today && remainingOnInvoice(inv) > 0
      }
      return true
    })
  }, [invoices, statusFilter])

  const cashflowSeries = useMemo(() => buildMonthlyCashflow(payments, filterCtx), [payments, dateFrom, dateTo, propertyFilter])
  const evcSeries = useMemo(() => buildExpectedVsCollected(filteredInvoices, filterCtx), [filteredInvoices, dateFrom, dateTo, propertyFilter])
  const agingBuckets = useMemo(() => buildAgingBuckets(filteredInvoices, { todayIso: todayIsoDate(), propertyId: propertyFilter }), [filteredInvoices, propertyFilter])
  const leaseExpiry = useMemo(() => buildLeaseExpiryForecast(contracts, { todayIso: todayIsoDate(), propertyId: propertyFilter }), [contracts, propertyFilter])
  const maintByProp = useMemo(() => buildMaintenanceByProperty(maintenance, filterCtx), [maintenance, dateFrom, dateTo, propertyFilter])
  const vatLedger = useMemo(() => buildVatLedger(filteredInvoices, { ...filterCtx, ratePct: vatRatePct }), [filteredInvoices, dateFrom, dateTo, propertyFilter, vatRatePct])
  const totals = useMemo(() => rangeTotals(filteredInvoices, filterCtx), [filteredInvoices, dateFrom, dateTo, propertyFilter])

  const occupancyPortfolio = useMemo(() => {
    let rented = 0
    let vacant = 0
    let other = 0
    for (const u of units || []) {
      if (propertyFilter && String(u.property_id || u?.property?.id || '') !== propertyFilter) continue
      if (u.status === 'مؤجرة') rented += 1
      else if (u.status === 'شاغرة') vacant += 1
      else other += 1
    }
    return { rented, vacant, other, total: rented + vacant + other }
  }, [units, propertyFilter])

  /* Existing sections (Net ROI, Delinquency, Occupancy, OPEX) */

  const netRoiRows = useMemo(
    () => buildNetRoiRowsByProperty({ payments, maintenance, emptyProperties: [] }),
    [payments, maintenance],
  )

  const netRoiExport = useMemo(() => {
    return netRoiRows.map((r) => ({
      [t('common.property')]: r.property_name,
      [t('reports.collectedRevenue')]: r.gross_collected_revenue,
      [t('reports.maintenanceOpex')]: r.maintenance_opex,
      [t('reports.netIncome')]: r.net_operating_income,
      [t('reports.marginPct')]: r.margin_pct == null ? '' : Number(r.margin_pct.toFixed(2)),
    }))
  }, [netRoiRows, t])

  const delinquencyRows = useMemo(() => {
    const today = todayIsoDate()
    const rows = []
    for (const inv of invoices) {
      if (propertyFilter && String(inv.property_id || '') !== propertyFilter) continue
      const st = paymentStatusOfInvoice(inv)
      if (st === 'مدفوعة بالكامل') continue
      if (!inv.due_date || String(inv.due_date) >= today) continue
      const remaining = remainingOnInvoice(inv)
      if (remaining <= 0) continue
      const days = daysBetweenISO(String(inv.due_date), today)
      rows.push({
        invoice_id: inv.id,
        tenant_name: inv.tenant_full_name || '',
        tenant_phone: inv.tenant_phone || '',
        due_date: inv.due_date,
        days_overdue: days,
        payment_status: st,
        remaining,
        property_name: inv.property_name || '',
        unit_name: inv.unit_name || '',
      })
    }
    rows.sort((a, b) => b.days_overdue - a.days_overdue)
    return rows
  }, [invoices, propertyFilter])

  const delinquencyExport = useMemo(() => {
    return delinquencyRows.map((r) => ({
      [t('reports.invoiceId')]: r.invoice_id,
      [t('common.property')]: r.property_name,
      [t('common.unit')]: r.unit_name,
      [t('common.tenant')]: r.tenant_name,
      [t('reports.phone')]: r.tenant_phone,
      [t('reports.dueDate')]: r.due_date,
      [t('reports.daysOverdue')]: r.days_overdue,
      [t('reports.remaining')]: r.remaining,
      [t('common.status')]: translateInvoicePaymentStatus(r.payment_status, lang),
    }))
  }, [delinquencyRows, t, lang])

  const occupancyRows = useMemo(() => {
    const by = new Map()
    for (const u of units) {
      const pid = u.property_id || u?.property?.id
      if (!pid) continue
      if (propertyFilter && String(pid) !== propertyFilter) continue
      const name = u.property_name || u?.property?.name || ''
      const cur = by.get(pid) || { property_id: pid, property_name: name, total: 0, rented: 0, vacant: 0, other: 0 }
      cur.total += 1
      if (u.status === 'مؤجرة') cur.rented += 1
      else if (u.status === 'شاغرة') cur.vacant += 1
      else cur.other += 1
      if (name) cur.property_name = name
      by.set(pid, cur)
    }
    const rows = [...by.values()].map((r) => {
      const rentedPct = r.total > 0 ? (r.rented / r.total) * 100 : 0
      const vacantPct = r.total > 0 ? (r.vacant / r.total) * 100 : 0
      return { ...r, rented_pct: rentedPct, vacant_pct: vacantPct }
    })
    rows.sort((a, b) => b.rented_pct - a.rented_pct)
    return rows
  }, [units, propertyFilter])

  const occupancyExport = useMemo(() => {
    return occupancyRows.map((r) => ({
      [t('common.property')]: r.property_name,
      [t('reports.totalUnits')]: r.total,
      [t('reports.rented')]: r.rented,
      [t('reports.vacant')]: r.vacant,
      [t('reports.other')]: r.other,
      [t('reports.occupancyRate')]: Number(r.rented_pct.toFixed(2)),
      [t('reports.vacancyApprox')]: Number(r.vacant_pct.toFixed(2)),
    }))
  }, [occupancyRows, t])

  const opexRows = useMemo(() => {
    const from = String(opexFrom || '')
    const to = String(opexTo || '')
    const filtered = maintenance.filter((m) => {
      if (propertyFilter && String(m.property_id || '') !== propertyFilter) return false
      const mday = String(m.created_at || '').slice(0, 10)
      if (!mday) return false
      if (from && mday < from) return false
      if (to && mday > to) return false
      return true
    })

    const map = new Map()
    for (const m of filtered) {
      const mk = monthKeyFromTs(m.created_at)
      const cat = m.property_category || '—'
      const key = `${mk}||${cat}`
      const cur = map.get(key) || { period: mk, category: cat, total: 0, count: 0 }
      cur.total += Number(m.cost_amount || 0)
      cur.count += 1
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) =>
      a.period === b.period ? a.category.localeCompare(b.category) : b.period.localeCompare(a.period),
    )
  }, [maintenance, opexFrom, opexTo, propertyFilter])

  const opexExport = useMemo(() => {
    return opexRows.map((r) => ({
      [t('reports.month')]: r.period,
      [t('reports.propertyCategory')]: r.category,
      [t('reports.totalCost')]: r.total,
      [t('reports.requestCount')]: r.count,
    }))
  }, [opexRows, t])

  const vatExport = useMemo(
    () =>
      vatLedger.map((row) => ({
        [t('reports.vatMonth')]: row.month,
        [t('reports.vatTaxable')]: row.taxable,
        [t('reports.vatExpected')]: row.expectedVat,
        [t('reports.vatActual')]: row.actualVat,
      })),
    [vatLedger, t],
  )

  /* --------------------------- chart helpers --------------------------- */

  const xTickReverse = dir === 'rtl'
  const moneyFmt = (v) => formatMoneyLocale(v, lang)
  const shortMoneyFmt = (v) => {
    const n = Number(v) || 0
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return moneyFmt(n)
  }

  return (
    <div className="reports-root max-w-7xl space-y-5 print:max-w-none">
      {/* HERO */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white shadow-md print:border-slate-200 print:bg-white print:text-slate-900">
        <div className="text-xs font-bold text-slate-300 print:text-slate-500">{t('reports.heroKicker')}</div>
        <div className="mt-1 text-2xl font-extrabold tracking-tight">{t('reports.heroTitle')}</div>
        <div className="mt-2 max-w-3xl text-sm text-slate-300 print:text-slate-600">{t('reports.heroBody')}</div>
      </div>

      {/* GLOBAL FILTER BAR */}
      <Card>
        <CardHeader>
          <CardTitle>{t('reports.filterBarTitle')}</CardTitle>
          <CardDescription>{t('reports.filterBarDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>{t('reports.filterDateFrom')}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>{t('reports.filterDateTo')}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div>
              <Label>{t('reports.filterProperty')}</Label>
              <select
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
              >
                <option value="">{t('reports.filterAllProperties')}</option>
                {propertyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || '—'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('reports.filterStatus')}</Label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">{t('reports.statusAll')}</option>
                <option value="paid">{t('reports.statusPaid')}</option>
                <option value="partial">{t('reports.statusPartial')}</option>
                <option value="unpaid">{t('reports.statusUnpaid')}</option>
                <option value="overdue">{t('reports.statusOverdue')}</option>
              </select>
            </div>
            <div>
              <Label>{t('reports.vatRate')} (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={vatRatePct}
                onChange={(e) => setVatRatePct(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricTile label={t('reports.totalExpectedLabel')} value={moneyFmt(totals.expected)} tone="neutral" />
            <MetricTile label={t('reports.totalCollectedLabel')} value={moneyFmt(totals.collected)} tone="success" />
            <MetricTile label={t('reports.totalGapLabel')} value={moneyFmt(totals.gap)} tone="warning" />
          </div>
        </CardContent>
      </Card>

      {/* CASHFLOW TREND (area chart) */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>{t('reports.cashflowTitle')}</CardTitle>
          <CardDescription>{t('reports.cashflowDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <SkeletonChart />
          ) : cashflowSeries.every((r) => r.collected === 0) ? (
            <EmptyChart />
          ) : (
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashflowSeries} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cashflowFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" reversed={xTickReverse} stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={shortMoneyFmt} width={80} />
                  <Tooltip
                    formatter={(v) => moneyFmt(v)}
                    contentStyle={{ direction: dir, borderRadius: 12, borderColor: '#e2e8f0' }}
                    cursor={{ stroke: CHART_COLORS.primarySoft, strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="collected"
                    name={t('reports.collectedAmount')}
                    stroke={CHART_COLORS.primary}
                    fill="url(#cashflowFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* EXPECTED VS COLLECTED (dual bars) */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>{t('reports.expectedVsCollectedTitle')}</CardTitle>
          <CardDescription>{t('reports.expectedVsCollectedDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <SkeletonChart />
          ) : evcSeries.every((r) => r.expected === 0 && r.collected === 0) ? (
            <EmptyChart />
          ) : (
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evcSeries} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" reversed={xTickReverse} stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={shortMoneyFmt} width={80} />
                  <Tooltip
                    formatter={(v) => moneyFmt(v)}
                    contentStyle={{ direction: dir, borderRadius: 12, borderColor: '#e2e8f0' }}
                    cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="expected" name={t('reports.expected')} fill={CHART_COLORS.neutral} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="collected" name={t('reports.collected')} fill={CHART_COLORS.success} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OVERDUE AGING MATRIX */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>{t('reports.overdueAgingTitle')}</CardTitle>
          <CardDescription>{t('reports.overdueAgingDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <SkeletonChart />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="h-64 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { bucket: t('reports.bucket0to30'), amount: agingBuckets.b0_30.amount, count: agingBuckets.b0_30.count, tone: CHART_COLORS.warning },
                      { bucket: t('reports.bucket31to60'), amount: agingBuckets.b31_60.amount, count: agingBuckets.b31_60.count, tone: CHART_COLORS.warning },
                      { bucket: t('reports.bucket61to90'), amount: agingBuckets.b61_90.amount, count: agingBuckets.b61_90.count, tone: CHART_COLORS.danger },
                      { bucket: t('reports.bucket90plus'), amount: agingBuckets.b90plus.amount, count: agingBuckets.b90plus.count, tone: CHART_COLORS.deep },
                    ]}
                    margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="bucket" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={shortMoneyFmt} width={80} />
                    <Tooltip
                      formatter={(v) => moneyFmt(v)}
                      contentStyle={{ direction: dir, borderRadius: 12, borderColor: '#e2e8f0' }}
                    />
                    <Bar dataKey="amount" name={t('common.amount')} radius={[6, 6, 0, 0]}>
                      {[CHART_COLORS.warning, CHART_COLORS.warning, CHART_COLORS.danger, CHART_COLORS.deep].map((c, i) => (
                        <Cell key={i} fill={c} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                <AgingRow label={t('reports.bucket0to30')} count={agingBuckets.b0_30.count} amount={agingBuckets.b0_30.amount} tone="warning" fmt={moneyFmt} />
                <AgingRow label={t('reports.bucket31to60')} count={agingBuckets.b31_60.count} amount={agingBuckets.b31_60.amount} tone="warning" fmt={moneyFmt} />
                <AgingRow label={t('reports.bucket61to90')} count={agingBuckets.b61_90.count} amount={agingBuckets.b61_90.amount} tone="danger" fmt={moneyFmt} />
                <AgingRow label={t('reports.bucket90plus')} count={agingBuckets.b90plus.count} amount={agingBuckets.b90plus.amount} tone="deep" fmt={moneyFmt} />
                <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-300">{t('reports.bucketsFooter')}</div>
                  <div className="text-lg font-black">
                    {moneyFmt(
                      agingBuckets.b0_30.amount + agingBuckets.b31_60.amount + agingBuckets.b61_90.amount + agingBuckets.b90plus.amount,
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PORTFOLIO OCCUPANCY PIE */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>{t('reports.occupancyPieTitle')}</CardTitle>
          <CardDescription>{t('reports.occupancyPieDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <SkeletonChart />
          ) : occupancyPortfolio.total === 0 ? (
            <EmptyChart />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="h-72 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      formatter={(value, name) => [value, name]}
                      contentStyle={{ direction: dir, borderRadius: 12, borderColor: '#e2e8f0' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Pie
                      data={[
                        { name: t('reports.rented'), value: occupancyPortfolio.rented, fill: CHART_COLORS.success },
                        { name: t('reports.vacant'), value: occupancyPortfolio.vacant, fill: CHART_COLORS.warning },
                        { name: t('reports.other'), value: occupancyPortfolio.other, fill: CHART_COLORS.neutral },
                      ].filter((d) => d.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      stroke="#ffffff"
                      strokeWidth={2}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center gap-3 self-center">
                <MetricTile
                  label={t('reports.portfolioOccupancy')}
                  value={`${occupancyPortfolio.total === 0 ? 0 : ((occupancyPortfolio.rented / occupancyPortfolio.total) * 100).toFixed(1)}%`}
                  tone="success"
                />
                <div className="grid grid-cols-3 gap-2">
                  <MetricTile label={t('reports.rented')} value={occupancyPortfolio.rented} tone="success" />
                  <MetricTile label={t('reports.vacant')} value={occupancyPortfolio.vacant} tone="warning" />
                  <MetricTile label={t('reports.other')} value={occupancyPortfolio.other} tone="neutral" />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LEASE EXPIRY FORECAST */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>{t('reports.leaseExpiryTitle')}</CardTitle>
          <CardDescription>{t('reports.leaseExpiryDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <SkeletonChart />
          ) : leaseExpiry.totalActive === 0 ? (
            <EmptyChart message={t('reports.expiryNone')} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ExpiryTile label={t('reports.expiryIn30')} value={leaseExpiry.b30} tone="danger" />
              <ExpiryTile label={t('reports.expiryIn60')} value={leaseExpiry.b60} tone="warning" />
              <ExpiryTile label={t('reports.expiryIn90')} value={leaseExpiry.b90} tone="neutral" />
              <ExpiryTile label={t('reports.expiryBeyond')} value={leaseExpiry.beyond} tone="success" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* MAINTENANCE BY PROPERTY (bar chart) */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle>{t('reports.maintByProperty')}</CardTitle>
          <CardDescription>{t('reports.maintByPropertyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <SkeletonChart />
          ) : maintByProp.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={maintByProp.slice(0, 12)} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="property_name" stroke="#64748b" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={shortMoneyFmt} width={80} />
                  <Tooltip
                    formatter={(v) => moneyFmt(v)}
                    contentStyle={{ direction: dir, borderRadius: 12, borderColor: '#e2e8f0' }}
                    cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                  />
                  <Bar dataKey="total" name={t('reports.totalCost')} fill={CHART_COLORS.sky} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* VAT / TAX SUMMARY */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('reports.vatTitle')}</CardTitle>
              <CardDescription>{t('reports.vatDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={vatExport} filename="vat-summary" label={t('common.export')} disabled={busy} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {busy ? (
            <SkeletonChart />
          ) : vatLedger.every((r) => r.taxable === 0 && r.actualVat === 0) ? (
            <EmptyChart />
          ) : (
            <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-start text-xs font-bold text-slate-600">
                      <th className="px-4 py-3">{t('reports.vatMonth')}</th>
                      <th className="px-4 py-3">{t('reports.vatTaxable')}</th>
                      <th className="px-4 py-3">{t('reports.vatExpected')}</th>
                      <th className="px-4 py-3">{t('reports.vatActual')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {vatLedger.map((row) => (
                      <tr key={row.month} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900">{row.month}</td>
                        <td className="px-4 py-3 text-slate-800">{moneyFmt(row.taxable)}</td>
                        <td className="px-4 py-3 text-slate-700">{moneyFmt(row.expectedVat)}</td>
                        <td className="px-4 py-3 font-extrabold text-emerald-700">{moneyFmt(row.actualVat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-500">{t('reports.vatNote')}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* EXISTING — Net ROI by Property (table) */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('reports.netRoiTitle')}</CardTitle>
              <CardDescription>{t('reports.netRoiDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={netRoiExport} filename="net-income-by-property" label={t('common.export')} disabled={busy} />
              <TargetedPdfButton
                label={t('common.printPdf')}
                disabled={busy}
                onClick={() => {
                  try {
                    exportReportPdf({
                      title: t('reports.netRoiTitle'),
                      subtitle: t('reports.netRoiDesc'),
                      filename: 'net-income-by-property',
                      metaLines: [`${t('common.date')}: ${todayIsoDate()}`],
                      rows: netRoiExport,
                    })
                  } catch (e) {
                    reportLoadFailure((payload) => toastPushRef.current?.(payload), e, tRef.current('errors.generic'), true)
                  }
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ) : (
            <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-start text-xs font-bold text-slate-600">
                      <th className="px-4 py-3">{t('common.property')}</th>
                      <th className="px-4 py-3">{t('reports.collectedRevenue')}</th>
                      <th className="px-4 py-3">{t('reports.maintenanceOpex')}</th>
                      <th className="px-4 py-3">{t('reports.netIncome')}</th>
                      <th className="px-4 py-3">{t('reports.marginPct')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {netRoiRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                          {t('reports.noNetRoi')}
                        </td>
                      </tr>
                    ) : (
                      netRoiRows.map((r) => (
                        <tr key={r.property_id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-bold text-slate-900">{r.property_name || '-'}</td>
                          <td className="px-4 py-3 text-slate-800">{moneyFmt(r.gross_collected_revenue)}</td>
                          <td className="px-4 py-3 text-slate-800">{moneyFmt(r.maintenance_opex)}</td>
                          <td className="px-4 py-3 font-extrabold text-slate-900">{moneyFmt(r.net_operating_income)}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {r.margin_pct == null ? '-' : `${r.margin_pct.toFixed(2)}%`}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* EXISTING — Delinquency */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('reports.delinquencyTitle')}</CardTitle>
              <CardDescription>{t('reports.delinquencyDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={delinquencyExport} filename="delinquency" label={t('common.export')} disabled={busy} />
              <TargetedPdfButton
                label={t('common.printPdf')}
                disabled={busy}
                onClick={() => {
                  try {
                    exportReportPdf({
                      title: t('reports.delinquencyTitle'),
                      subtitle: t('reports.delinquencyDesc'),
                      filename: 'delinquency',
                      metaLines: [`${t('common.date')}: ${todayIsoDate()}`],
                      rows: delinquencyExport,
                    })
                  } catch (e) {
                    reportLoadFailure((payload) => toastPushRef.current?.(payload), e, tRef.current('errors.generic'), true)
                  }
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ) : (
            <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-start text-xs font-bold text-slate-600">
                      <th className="px-4 py-3">{t('common.tenant')}</th>
                      <th className="px-4 py-3">{t('reports.phone')}</th>
                      <th className="px-4 py-3">{t('reports.whatsapp')}</th>
                      <th className="px-4 py-3">{t('common.property')}</th>
                      <th className="px-4 py-3">{t('common.unit')}</th>
                      <th className="px-4 py-3">{t('reports.dueDate')}</th>
                      <th className="px-4 py-3">{t('reports.daysOverdue')}</th>
                      <th className="px-4 py-3">{t('reports.remaining')}</th>
                      <th className="px-4 py-3">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {delinquencyRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                          {t('reports.noDelinquency')}
                        </td>
                      </tr>
                    ) : (
                      delinquencyRows.map((r) => {
                        const wa = whatsappUrl(r.tenant_phone)
                        return (
                          <tr key={r.invoice_id} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-bold text-slate-900">{r.tenant_name || '-'}</td>
                            <td className="px-4 py-3 text-slate-800">{r.tenant_phone || '-'}</td>
                            <td className="px-4 py-3">
                              {wa ? (
                                <a
                                  href={wa}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex rounded-lg bg-success px-3 py-1 text-xs font-bold text-success-fg hover:opacity-95"
                                >
                                  {t('reports.whatsapp')}
                                </a>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-800">{r.property_name || '-'}</td>
                            <td className="px-4 py-3 text-slate-800">{r.unit_name || '-'}</td>
                            <td className="px-4 py-3 text-slate-700">{r.due_date}</td>
                            <td className="px-4 py-3 font-extrabold text-red-700">{r.days_overdue}</td>
                            <td className="px-4 py-3 font-extrabold text-slate-900">{moneyFmt(r.remaining)}</td>
                            <td className="px-4 py-3 text-slate-700">{translateInvoicePaymentStatus(r.payment_status, lang)}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* EXISTING — Occupancy cards */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('reports.occupancyTitle')}</CardTitle>
              <CardDescription>{t('reports.occupancyDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={occupancyExport} filename="occupancy" label={t('common.export')} disabled={busy} />
              <TargetedPdfButton
                label={t('common.printPdf')}
                disabled={busy}
                onClick={() => {
                  try {
                    exportReportPdf({
                      title: t('reports.occupancyTitle'),
                      subtitle: t('reports.occupancyDesc'),
                      filename: 'occupancy',
                      metaLines: [`${t('common.date')}: ${todayIsoDate()}`],
                      rows: occupancyExport,
                    })
                  } catch (e) {
                    reportLoadFailure((payload) => toastPushRef.current?.(payload), e, tRef.current('errors.generic'), true)
                  }
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ) : (
            <div className="space-y-3">
              {occupancyRows.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">{t('reports.noUnits')}</div>
              ) : (
                occupancyRows.map((r) => (
                  <div key={r.property_id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-slate-900">{r.property_name || '-'}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          {t('reports.totalUnits')}: <span className="font-bold text-slate-900">{r.total}</span> — {t('reports.rented')}:{' '}
                          <span className="font-bold text-slate-900">{r.rented}</span> — {t('reports.vacant')}:{' '}
                          <span className="font-bold text-slate-900">{r.vacant}</span>
                          {r.other ? (
                            <>
                              {' '}
                              — {t('reports.other')}: <span className="font-bold text-slate-900">{r.other}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-start text-xs font-bold text-slate-600">
                        {t('reports.occupancyRate')}: <span className="font-bold text-amber-600">{r.rented_pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-amber-500 to-amber-300"
                        style={{ width: `${Math.min(100, Math.max(0, r.rented_pct)).toFixed(2)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] font-bold text-slate-500">
                      <span>
                        {t('reports.vacancyApprox')}: {r.vacant_pct.toFixed(1)}%
                      </span>
                      <span>
                        {t('reports.portfolioHealth')}: {r.rented >= r.vacant ? t('reports.portfolioGood') : t('reports.portfolioWatch')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* EXISTING — OPEX detail table */}
      <Card className="print:break-inside-avoid">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('reports.opexTitle')}</CardTitle>
              <CardDescription>{t('reports.opexDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={opexExport} filename="opex-maintenance" label={t('common.export')} disabled={busy} />
              <TargetedPdfButton
                label={t('common.printPdf')}
                disabled={busy}
                onClick={() => {
                  try {
                    exportReportPdf({
                      title: t('reports.opexTitle'),
                      subtitle: t('reports.opexDesc'),
                      filename: 'opex-maintenance',
                      metaLines: [
                        `${t('reports.fromDate')}: ${String(opexFrom || '-')}`,
                        `${t('reports.toDate')}: ${String(opexTo || '-')}`,
                      ],
                      rows: opexExport,
                    })
                  } catch (e) {
                    reportLoadFailure((payload) => toastPushRef.current?.(payload), e, tRef.current('errors.generic'), true)
                  }
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('reports.fromDate')}</Label>
              <Input type="date" value={opexFrom} onChange={(e) => setOpexFrom(e.target.value)} />
            </div>
            <div>
              <Label>{t('reports.toDate')}</Label>
              <Input type="date" value={opexTo} onChange={(e) => setOpexTo(e.target.value)} />
            </div>
          </div>

          {busy ? (
            <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ) : (
            <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-start text-xs font-bold text-slate-600">
                      <th className="px-4 py-3">{t('reports.month')}</th>
                      <th className="px-4 py-3">{t('reports.propertyCategory')}</th>
                      <th className="px-4 py-3">{t('reports.totalCost')}</th>
                      <th className="px-4 py-3">{t('reports.requestCount')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {opexRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                          {t('reports.noOpexInRange')}
                        </td>
                      </tr>
                    ) : (
                      opexRows.map((r) => (
                        <tr key={`${r.period}-${r.category}`} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900">{r.period}</td>
                          <td className="px-4 py-3 text-slate-800">{r.category}</td>
                          <td className="px-4 py-3 font-extrabold text-slate-900">{moneyFmt(r.total)}</td>
                          <td className="px-4 py-3 text-slate-700">{r.count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* --------------------------- small primitives --------------------------- */

function MetricTile({ label, value, tone = 'neutral' }) {
  const toneMap = {
    neutral: 'bg-slate-50 ring-slate-200 text-slate-900',
    success: 'bg-emerald-50 ring-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 ring-amber-200 text-amber-900',
    danger: 'bg-rose-50 ring-rose-200 text-rose-900',
  }
  return (
    <div className={`rounded-2xl p-4 ring-1 ${toneMap[tone]}`}>
      <div className="text-[11px] font-extrabold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
    </div>
  )
}

function AgingRow({ label, count, amount, tone, fmt }) {
  const toneMap = {
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    danger: 'bg-rose-50 text-rose-900 ring-rose-200',
    deep: 'bg-slate-900 text-white ring-slate-700',
  }
  return (
    <div className={`flex items-center justify-between rounded-xl px-4 py-3 ring-1 ${toneMap[tone] || 'bg-slate-50 ring-slate-200 text-slate-900'}`}>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide opacity-75">{label}</div>
        <div className="mt-0.5 text-xs opacity-80">{count}</div>
      </div>
      <div className="text-lg font-black tabular-nums">{fmt(amount)}</div>
    </div>
  )
}

function ExpiryTile({ label, value, tone }) {
  const toneMap = {
    danger: 'bg-rose-50 text-rose-900 ring-rose-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    neutral: 'bg-sky-50 text-sky-900 ring-sky-200',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  }
  return (
    <div className={`rounded-2xl p-5 ring-1 ${toneMap[tone]}`}>
      <div className="text-[11px] font-extrabold uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-1 text-3xl font-black tabular-nums">{value}</div>
    </div>
  )
}

function SkeletonChart() {
  return <div className="h-64 w-full animate-pulse rounded-2xl bg-slate-100" />
}

function EmptyChart({ message }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-48 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500 ring-1 ring-slate-200">
      {message || t('reports.chartNoData')}
    </div>
  )
}
