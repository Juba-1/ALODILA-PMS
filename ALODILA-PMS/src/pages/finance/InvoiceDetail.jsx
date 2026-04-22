import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import { getInvoiceById } from '../../lib/db/invoices'
import { moneyToCents, centsToMoneyString } from '../../lib/money/cents'
import { paymentStatusOfInvoice, remainingOnInvoice, sumPaid } from '../../lib/finance/invoiceDerived'
import { computeInstallmentSchedule } from '../../lib/finance/schedule'
import { ALODILA_LOGO_URL } from '../../lib/brand/logoUrl'
import { translateInvoicePaymentStatus } from '../../lib/i18n/domainLabels'

function money(v) {
  return centsToMoneyString(moneyToCents(v))
}

function fmtId(id) {
  return String(id || '').slice(0, 8).toUpperCase()
}

export default function InvoiceDetail() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const { id } = useParams()
  const { push } = useToastDispatch()
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const tRef = useRef(t)
  tRef.current = t

  const [busy, setBusy] = useState(true)
  const [inv, setInv] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const row = await getInvoiceById(id)
        if (!cancelled) setInv(row)
      } catch (e) {
        if (!cancelled) reportLoadFailure((p) => toastPushRef.current?.(p), e, tRef.current('invoiceDetail.loadFail'), true)
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const rawStatus = inv ? paymentStatusOfInvoice(inv) : ''
  const status = translateInvoicePaymentStatus(rawStatus, lang)
  const paid = inv ? sumPaid(inv) : 0
  const remaining = inv ? remainingOnInvoice(inv) : 0

  const contract = inv?.contract || null

  const inferredBreakdown = useMemo(() => {
    if (!inv || !contract) return { show: false, rent: 0, flat: 0, note: '' }
    const subtotal = Number(inv?.subtotal_amount || 0)
    const schedule = computeInstallmentSchedule({
      contract_value: contract.contract_value,
      start_date: contract.start_date,
      end_date: contract.end_date,
      billing_cycle: contract.billing_cycle || 'شهري',
      utility_payment_type: contract.utility_payment_type || 'مستقل',
      utility_flat_amount_sar: contract.utility_flat_amount_sar,
      vat_applicable: false,
    })
    if (!schedule.count) return { show: false, rent: 0, flat: 0, note: '' }

    const rent = schedule.per_installment_rent
    const flat = schedule.per_installment_utility
    const expected = Math.round((rent + flat) * 100) / 100
    const hasFlat = contract.utility_payment_type === 'مقطوع' && flat > 0
    const ok = Math.abs(expected - subtotal) < 0.01
    return {
      show: true,
      rent,
      flat,
      hasFlat,
      note: ok ? '' : tRef.current('invoiceDetail.manualAdjustNote'),
    }
  }, [inv, contract])

  const title = useMemo(() => t('invoiceDetail.title'), [t])

  return (
    <div className="max-w-5xl space-y-4 invoice-root">
      <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-extrabold text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-500">
            <Link to="/finance" className="font-semibold text-slate-900 hover:underline">
              {t('invoiceDetail.financeLink')}
            </Link>{' '}
            / {t('invoiceDetail.breadcrumb')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" onClick={() => window.print()} disabled={busy || !inv}>
            {t('invoiceDetail.printPdf')}
          </Button>
          <Link to="/finance">
            <Button variant="ghost">{t('invoiceDetail.back')}</Button>
          </Link>
        </div>
      </div>

      <Card className="invoice-doc">
        <CardHeader>
          <CardTitle>{t('invoiceDetail.pageTitle')}</CardTitle>
          <CardDescription>{t('invoiceDetail.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : !inv ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{t('invoiceDetail.noData')}</div>
          ) : (
            <>
              <div className="print-only invoice-print-header">
                <img src={ALODILA_LOGO_URL} alt="ALODILA" className="invoice-logo" referrerPolicy="no-referrer" />
                <div className="invoice-header-text">
                  <div className="invoice-brand">{t('invoiceDetail.brand')}</div>
                  <div className="invoice-title">{t('invoiceDetail.pageTitle')}</div>
                  <div className="invoice-meta">
                    <div>{t('invoiceDetail.headerNumber')} {fmtId(inv.id)}</div>
                    <div>{t('invoiceDetail.headerIssueDate')} {String(inv.created_at || '').slice(0, 10) || '-'}</div>
                    <div>{t('invoiceDetail.headerDueDate')} {inv.due_date}</div>
                    <div>{t('invoiceDetail.headerStatus')} {status}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-bold text-slate-500">{t('invoiceDetail.propertyBlock')}</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-900">
                    <div>
                      <span className="text-slate-500">{t('invoiceDetail.property')}</span>{' '}
                      <span className="font-semibold">{inv.property_name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">{t('invoiceDetail.unit')}</span>{' '}
                      <span className="font-semibold">{inv.unit_name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">{t('invoiceDetail.propertyCategory')}</span>{' '}
                      <span className="font-semibold">{inv.property_category || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-bold text-slate-500">{t('invoiceDetail.tenantBlock')}</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-900">
                    <div>
                      <span className="text-slate-500">{t('invoiceDetail.tenantName')}</span>{' '}
                      <span className="font-semibold">{inv.tenant_full_name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">{t('invoiceDetail.tenantPhone')}</span>{' '}
                      <span className="font-semibold">{inv.tenant_phone || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">{t('invoiceDetail.ejarNumber')}</span>{' '}
                      <span className="font-semibold">{inv.ejar_contract_number || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm invoice-table">
                  <thead className="bg-slate-50">
                    <tr className="text-start text-xs font-extrabold text-slate-700">
                      <th className="px-4 py-3">{t('invoiceDetail.colLine')}</th>
                      <th className="px-4 py-3">{t('invoiceDetail.colDescription')}</th>
                      <th className="px-4 py-3">{t('invoiceDetail.colAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {inferredBreakdown.show ? (
                      <>
                        <tr className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-900">{t('invoiceDetail.lineRent')}</td>
                          <td className="px-4 py-3 text-slate-700">{t('invoiceDetail.lineRentDesc')}</td>
                          <td className="px-4 py-3 font-mono text-slate-900">{money(inferredBreakdown.rent)}</td>
                        </tr>
                        {inferredBreakdown.hasFlat ? (
                          <tr className="border-t border-slate-100">
                            <td className="px-4 py-3 font-semibold text-slate-900">{t('invoiceDetail.lineUtility')}</td>
                            <td className="px-4 py-3 text-slate-700">{t('invoiceDetail.lineUtilityDesc')}</td>
                            <td className="px-4 py-3 font-mono text-slate-900">{money(inferredBreakdown.flat)}</td>
                          </tr>
                        ) : null}
                        {inferredBreakdown.note ? (
                          <tr className="border-t border-slate-100">
                            <td className="px-4 py-3" colSpan={3}>
                              <div className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                                {inferredBreakdown.note}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    ) : (
                      <tr className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">{t('invoiceDetail.lineRentPlain')}</td>
                        <td className="px-4 py-3 text-slate-700">{t('invoiceDetail.lineRentPlainDesc')}</td>
                        <td className="px-4 py-3 font-mono text-slate-900">{money(inv.subtotal_amount)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-white">
                    <tr className="border-t border-slate-200">
                      <td className="px-4 py-3 font-bold text-slate-700" colSpan={2}>
                        {t('invoiceDetail.subtotalRow')}
                      </td>
                      <td className="px-4 py-3 font-mono font-extrabold text-slate-900">{money(inv.subtotal_amount)}</td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold text-slate-700" colSpan={2}>
                        {t('invoiceDetail.vatRow')}
                      </td>
                      <td className="px-4 py-3 font-mono font-extrabold text-slate-900">
                        {inv.vat_applicable ? money(Number(inv.total_amount) - Number(inv.subtotal_amount)) : '0.00'}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td className="px-4 py-3 font-extrabold text-slate-900" colSpan={2}>
                        {t('invoiceDetail.totalRow')}
                      </td>
                      <td className="px-4 py-3 font-mono text-lg font-black text-slate-900">{money(inv.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-bold text-slate-500">{t('invoiceDetail.paymentStatus')}</div>
                  <div className="mt-1 text-lg font-extrabold text-slate-900">{status}</div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                  <div className="text-xs font-bold text-emerald-700">{t('invoiceDetail.collected')}</div>
                  <div className="mt-1 text-lg font-extrabold text-emerald-900">{money(paid)}</div>
                </div>
                <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <div className="text-xs font-bold text-amber-800">{t('invoiceDetail.remaining')}</div>
                  <div className="mt-1 text-lg font-extrabold text-amber-950">{money(remaining)}</div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm invoice-table">
                  <thead className="bg-slate-50">
                    <tr className="text-start text-xs font-extrabold text-slate-700">
                      <th className="px-4 py-3">{t('invoiceDetail.payments')}</th>
                      <th className="px-4 py-3">{t('invoiceDetail.paymentsDate')}</th>
                      <th className="px-4 py-3">{t('invoiceDetail.paymentsAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {(Array.isArray(inv.payments) ? inv.payments : [])
                      .filter((p) => p && p.is_deleted !== true)
                      .sort((a, b) => String(a.payment_date || '').localeCompare(String(b.payment_date || '')))
                      .map((p) => (
                        <tr key={p.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-mono text-[12px] text-slate-700">{fmtId(p.id)}</td>
                          <td className="px-4 py-3 text-slate-700">{p.payment_date}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-slate-900">{money(p.amount)}</td>
                        </tr>
                      ))}
                    {sumPaid(inv) <= 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                          {t('invoiceDetail.noPayments')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                {t('invoiceDetail.auditNote')}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
