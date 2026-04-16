import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { ExportButton } from '../../components/ExportButton'
import { PrintPdfButton } from '../../components/PrintPdfButton'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getOwnerActiveContracts, getOwnerReportingBundle } from '../../lib/db/ownerPortal'
import { buildNetRoiRowsByProperty } from '../../lib/finance/propertyNetIncome'
import { paymentStatusOfInvoice, remainingOnInvoice } from '../../lib/finance/invoiceDerived'
import { formatMoneyLocale } from '../../lib/format/moneyLocale'
import { translateInvoicePaymentStatus } from '../../lib/i18n/domainLabels'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function OwnerReports() {
  const { ownerCrmId } = useOutletContext()
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const { push } = useToastDispatch()
  const [busy, setBusy] = useState(true)
  const [payments, setPayments] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [invoices, setInvoices] = useState([])
  const [contracts, setContracts] = useState([])
  const [ownerProperties, setOwnerProperties] = useState([])

  const ownerKey = ownerCrmId || ''
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const [bundle, cont] = await Promise.all([
          getOwnerReportingBundle(ownerCrmId),
          getOwnerActiveContracts(ownerCrmId),
        ])
        if (cancelled) return
        setPayments(bundle.payments)
        setMaintenance(bundle.maintenance)
        setInvoices(bundle.invoices)
        setOwnerProperties(bundle.properties || [])
        setContracts(cont)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure((p) => toastPushRef.current?.(p), e, tRef.current('errors.loadReports'), true)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ownerKey])

  const netRoiRows = useMemo(
    () => buildNetRoiRowsByProperty({ payments, maintenance, emptyProperties: ownerProperties }),
    [payments, maintenance, ownerProperties],
  )

  const netRoiExport = useMemo(
    () =>
      netRoiRows.map((r) => ({
        [t('common.property')]: r.property_name,
        [t('reports.collectedRevenue')]: r.gross_collected_revenue,
        [t('reports.maintenanceOpex')]: r.maintenance_opex,
        [t('reports.netIncome')]: r.net_operating_income,
        [t('reports.marginPct')]: r.margin_pct == null ? '' : Number(r.margin_pct.toFixed(2)),
      })),
    [netRoiRows, t],
  )

  const today = todayISO()
  const overdueInvoices = useMemo(() => {
    return (invoices || [])
      .filter((inv) => {
        if (!inv.due_date || String(inv.due_date) >= today) return false
        return paymentStatusOfInvoice(inv) !== 'مدفوعة بالكامل'
      })
      .map((inv) => ({
        id: inv.id,
        due_date: inv.due_date,
        tenant: inv.tenant_full_name,
        unit: inv.unit_name,
        property: inv.property_name,
        status: paymentStatusOfInvoice(inv),
        remaining: remainingOnInvoice(inv),
        total: Number(inv.total_amount || 0),
      }))
  }, [invoices, today])

  const contractsExport = useMemo(
    () =>
      contracts.map((c) => ({
        [t('common.tenant')]: c.tenant_full_name,
        [t('common.unit')]: c.unit_name,
        [t('common.property')]: c.property_name,
        [t('owner.monthlyRent')]: c.monthly_rent ?? c.rent_amount,
        [t('owner.contractStart')]: c.start_date,
        [t('owner.contractEnd')]: c.end_date,
        [t('owner.contractValue')]: c.contract_value,
      })),
    [contracts, t],
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('owner.reportsTitle')}</CardTitle>
          <CardDescription>{t('owner.reportsDesc')}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{t('owner.netByPropertyTitle')}</CardTitle>
              <CardDescription>{t('owner.netByPropertyDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={netRoiExport} filename="owner-net-income" label={t('common.export')} disabled={busy} />
              <PrintPdfButton label={t('common.printPdf')} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : netRoiRows.length === 0 ? (
            <div className="text-sm text-slate-500">{t('owner.noNetRoi')}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="min-w-full border-collapse text-right text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2">{t('common.property')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('reports.collectedRevenue')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('reports.maintenanceOpex')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('reports.netIncome')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('reports.marginPct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {netRoiRows.map((r) => (
                    <tr key={r.property_id} className="odd:bg-white even:bg-slate-50/80">
                      <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-900">{r.property_name}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{formatMoneyLocale(r.gross_collected_revenue, lang)}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{formatMoneyLocale(r.maintenance_opex, lang)}</td>
                      <td className="border-b border-slate-100 px-3 py-2 font-bold">{formatMoneyLocale(r.net_operating_income, lang)}</td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        {r.margin_pct == null ? '—' : `${r.margin_pct.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('owner.activeContractsTitle')}</CardTitle>
          <CardDescription>{t('owner.activeContractsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : contracts.length === 0 ? (
            <div className="text-sm text-slate-500">{t('owner.noContracts')}</div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <ExportButton rows={contractsExport} filename="owner-active-leases" label={t('common.export')} disabled={busy} />
                <PrintPdfButton label={t('common.printPdf')} />
              </div>
              <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                <table className="min-w-full border-collapse text-right text-sm">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2">{t('common.tenant')}</th>
                      <th className="border-b border-slate-200 px-3 py-2">{t('common.unit')}</th>
                      <th className="border-b border-slate-200 px-3 py-2">{t('common.property')}</th>
                      <th className="border-b border-slate-200 px-3 py-2">{t('owner.monthlyRent')}</th>
                      <th className="border-b border-slate-200 px-3 py-2">{t('owner.contractStart')}</th>
                      <th className="border-b border-slate-200 px-3 py-2">{t('owner.contractEnd')}</th>
                      <th className="border-b border-slate-200 px-3 py-2">{t('owner.contractValue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c) => (
                      <tr key={c.id} className="odd:bg-white even:bg-slate-50/80">
                        <td className="border-b border-slate-100 px-3 py-2">{c.tenant_full_name}</td>
                        <td className="border-b border-slate-100 px-3 py-2">{c.unit_name}</td>
                        <td className="border-b border-slate-100 px-3 py-2">{c.property_name}</td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          {formatMoneyLocale(c.monthly_rent ?? c.rent_amount ?? 0, lang)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">{c.start_date}</td>
                        <td className="border-b border-slate-100 px-3 py-2">{c.end_date}</td>
                        <td className="border-b border-slate-100 px-3 py-2">{formatMoneyLocale(c.contract_value, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('owner.overdueTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : overdueInvoices.length === 0 ? (
            <div className="text-sm text-slate-500">{t('owner.noOverdue')}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="min-w-full border-collapse text-right text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2">{t('reports.dueDate')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('common.tenant')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('common.property')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('common.status')}</th>
                    <th className="border-b border-slate-200 px-3 py-2">{t('reports.remaining')}</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.map((r) => (
                    <tr key={r.id} className="odd:bg-white even:bg-slate-50/80">
                      <td className="border-b border-slate-100 px-3 py-2">{r.due_date}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{r.tenant}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{r.property}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{translateInvoicePaymentStatus(r.status, lang)}</td>
                      <td className="border-b border-slate-100 px-3 py-2">{formatMoneyLocale(r.remaining, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
