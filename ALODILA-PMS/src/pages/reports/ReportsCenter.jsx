import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getInvoices } from '../../lib/db/invoices'
import { getReportingMaintenance, getReportingPayments } from '../../lib/db/reports'
import { getUnitsInventory } from '../../lib/db/units'
import { buildNetRoiRowsByProperty } from '../../lib/finance/propertyNetIncome'
import { paymentStatusOfInvoice, remainingOnInvoice } from '../../lib/finance/invoiceDerived'
import { formatMoneyLocale } from '../../lib/format/moneyLocale'
import { translateInvoicePaymentStatus } from '../../lib/i18n/domainLabels'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { exportReportPdf } from '../../lib/print/targetedPdf'

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetweenISO(fromDateStr, toDateStr) {
  const a = new Date(`${fromDateStr}T00:00:00`)
  const b = new Date(`${toDateStr}T00:00:00`)
  const ms = b.getTime() - a.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
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
  const normalized = normalizePhoneForWa(phone)
  return normalized ? `https://wa.me/${normalized}` : null
}

function monthKeyFromTs(ts) {
  const s = String(ts || '')
  return s.length >= 7 ? s.slice(0, 7) : ''
}

export default function ReportsCenter() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
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

  const [opexFrom, setOpexFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  })
  const [opexTo, setOpexTo] = useState(todayISO)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const [p, m, inv, u] = await Promise.all([
          getReportingPayments(),
          getReportingMaintenance(),
          getInvoices(),
          getUnitsInventory(),
        ])
        if (cancelled) return
        setPayments(p)
        setMaintenance(m)
        setInvoices(inv)
        setUnits(u)
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
    const today = todayISO()
    const rows = []
    for (const inv of invoices) {
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
  }, [invoices])

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
  }, [units])

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
      const mk = monthKeyFromTs(m.created_at)
      if (!mk) return false
      const mday = String(m.created_at || '').slice(0, 10)
      if (from && mday < from) return false
      if (to && mday > to) return false
      return true
    })

    const map = new Map()
    for (const m of filtered) {
      const mk = monthKeyFromTs(m.created_at)
      const cat = m.property_category || 'غير مصنف'
      const key = `${mk}||${cat}`
      const cur = map.get(key) || { period: mk, category: cat, total: 0, count: 0 }
      cur.total += Number(m.cost_amount || 0)
      cur.count += 1
      map.set(key, cur)
    }
    const rows = [...map.values()].sort((a, b) => (a.period === b.period ? a.category.localeCompare(b.category) : b.period.localeCompare(a.period)))
    return rows
  }, [maintenance, opexFrom, opexTo])

  const opexExport = useMemo(() => {
    return opexRows.map((r) => ({
      [t('reports.month')]: r.period,
      [t('reports.propertyCategory')]: r.category,
      [t('reports.totalCost')]: r.total,
      [t('reports.requestCount')]: r.count,
    }))
  }, [opexRows, t])

  return (
    <div className="reports-root max-w-7xl space-y-5 print:max-w-none">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white shadow-md print:border-slate-200 print:bg-white print:text-slate-900">
        <div className="text-xs font-bold text-slate-300 print:text-slate-500">{t('reports.heroKicker')}</div>
        <div className="mt-1 text-2xl font-extrabold tracking-tight">{t('reports.heroTitle')}</div>
        <div className="mt-2 max-w-3xl text-sm text-slate-300 print:text-slate-600">{t('reports.heroBody')}</div>
      </div>

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
                      metaLines: [`${t('common.date')}: ${todayISO()}`],
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
                    <tr className="text-right text-xs font-bold text-slate-600">
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
                          <td className="px-4 py-3 text-slate-800">{formatMoneyLocale(r.gross_collected_revenue, lang)}</td>
                          <td className="px-4 py-3 text-slate-800">{formatMoneyLocale(r.maintenance_opex, lang)}</td>
                          <td className="px-4 py-3 font-extrabold text-slate-900">{formatMoneyLocale(r.net_operating_income, lang)}</td>
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
                      metaLines: [`${t('common.date')}: ${todayISO()}`],
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
                    <tr className="text-right text-xs font-bold text-slate-600">
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
                            <td className="px-4 py-3 font-extrabold text-slate-900">{formatMoneyLocale(r.remaining, lang)}</td>
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
                      metaLines: [`${t('common.date')}: ${todayISO()}`],
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
                      <div className="text-left text-xs font-bold text-slate-600 sm:text-right">
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
                    <tr className="text-right text-xs font-bold text-slate-600">
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
                          <td className="px-4 py-3 font-extrabold text-slate-900">{formatMoneyLocale(r.total, lang)}</td>
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
