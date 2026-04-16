import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import { getInvoiceById } from '../../lib/db/invoices'
import { moneyToCents, centsToMoneyString } from '../../lib/money/cents'
import { paymentStatusOfInvoice, remainingOnInvoice, sumPaid } from '../../lib/finance/invoiceDerived'
import { ALODILA_LOGO_URL } from '../../lib/brand/logoUrl'

function money(v) {
  return centsToMoneyString(moneyToCents(v))
}

function fmtId(id) {
  return String(id || '').slice(0, 8).toUpperCase()
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const { push } = useToastDispatch()
  const toastPushRef = useRef(push)
  toastPushRef.current = push

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
        if (!cancelled) reportLoadFailure((p) => toastPushRef.current?.(p), e, 'تعذر تحميل الفاتورة', true)
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const status = inv ? paymentStatusOfInvoice(inv) : ''
  const paid = inv ? sumPaid(inv) : 0
  const remaining = inv ? remainingOnInvoice(inv) : 0

  const contract = inv?.contract || null
  const flat = contract?.utility_payment_type === 'مقطوع' ? Number(contract?.utility_flat_amount_sar || 0) : 0
  const rent = Number(contract?.contract_value || 0)

  const inferredBreakdown = useMemo(() => {
    const subtotal = Number(inv?.subtotal_amount || 0)
    const hasFlat = contract?.utility_payment_type === 'مقطوع' && Number.isFinite(flat) && flat > 0
    const hasRent = Number.isFinite(rent) && rent >= 0
    if (!inv) return { show: false, rent: 0, flat: 0, note: '' }
    if (!hasFlat || !hasRent) return { show: false, rent: 0, flat: 0, note: '' }
    // We can show the contractual split, but the invoice may have been edited manually.
    const expected = Math.round((rent + flat) * 100) / 100
    const ok = Math.abs(expected - subtotal) < 0.01
    return {
      show: true,
      rent,
      flat,
      note: ok ? '' : 'ملاحظة: تم عرض التفصيل حسب العقد، لكن مبلغ الفاتورة قد تم تعديله يدوياً.',
    }
  }, [inv, contract?.utility_payment_type, flat, rent])

  const title = useMemo(() => 'تفاصيل الفاتورة', [])

  return (
    <div className="max-w-5xl space-y-4 invoice-root">
      <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-extrabold text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-500">
            <Link to="/finance" className="font-semibold text-slate-900 hover:underline">
              المركز المالي
            </Link>{' '}
            / فاتورة
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" onClick={() => window.print()} disabled={busy || !inv}>
            طباعة / PDF
          </Button>
          <Link to="/finance">
            <Button variant="ghost">رجوع</Button>
          </Link>
        </div>
      </div>

      <Card className="invoice-doc">
        <CardHeader>
          <CardTitle>Tax Invoice / Receipt — فاتورة / سند</CardTitle>
          <CardDescription>وثيقة مالية رسمية قابلة للطباعة والمراجعة</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          ) : !inv ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">تعذر تحميل الفاتورة.</div>
          ) : (
            <>
              <div className="print-only invoice-print-header">
                <img src={ALODILA_LOGO_URL} alt="ALODILA" className="invoice-logo" referrerPolicy="no-referrer" />
                <div className="invoice-header-text">
                  <div className="invoice-brand">مجموعة العضيلة — ALODILA-PMS</div>
                  <div className="invoice-title">فاتورة / سند (Tax Invoice / Receipt)</div>
                  <div className="invoice-meta">
                    <div>رقم: {fmtId(inv.id)}</div>
                    <div>تاريخ الإصدار: {String(inv.created_at || '').slice(0, 10) || '-'}</div>
                    <div>تاريخ الاستحقاق: {inv.due_date}</div>
                    <div>الحالة: {status}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-bold text-slate-500">بيانات العقار/الوحدة</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-900">
                    <div>
                      <span className="text-slate-500">العقار:</span> <span className="font-semibold">{inv.property_name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">الوحدة:</span> <span className="font-semibold">{inv.unit_name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">تصنيف العقار:</span> <span className="font-semibold">{inv.property_category || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-bold text-slate-500">بيانات المستأجر</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-900">
                    <div>
                      <span className="text-slate-500">الاسم:</span> <span className="font-semibold">{inv.tenant_full_name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">الجوال:</span> <span className="font-semibold">{inv.tenant_phone || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">رقم عقد إيجار:</span> <span className="font-semibold">{inv.ejar_contract_number || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <table className="w-full border-collapse text-sm invoice-table">
                  <thead className="bg-slate-50">
                    <tr className="text-right text-xs font-extrabold text-slate-700">
                      <th className="px-4 py-3">البند</th>
                      <th className="px-4 py-3">الوصف</th>
                      <th className="px-4 py-3">المبلغ (ر.س)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {inferredBreakdown.show ? (
                      <>
                        <tr className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-900">إيجار</td>
                          <td className="px-4 py-3 text-slate-700">إيجار حسب العقد</td>
                          <td className="px-4 py-3 font-mono text-slate-900">{money(inferredBreakdown.rent)}</td>
                        </tr>
                        <tr className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-900">خدمات</td>
                          <td className="px-4 py-3 text-slate-700">مبلغ مقطوع للكهرباء/المياه حسب الاتفاق</td>
                          <td className="px-4 py-3 font-mono text-slate-900">{money(inferredBreakdown.flat)}</td>
                        </tr>
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
                        <td className="px-4 py-3 font-semibold text-slate-900">إيجار</td>
                        <td className="px-4 py-3 text-slate-700">مبلغ الفاتورة قبل الضريبة</td>
                        <td className="px-4 py-3 font-mono text-slate-900">{money(inv.subtotal_amount)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-white">
                    <tr className="border-t border-slate-200">
                      <td className="px-4 py-3 font-bold text-slate-700" colSpan={2}>
                        الإجمالي قبل الضريبة
                      </td>
                      <td className="px-4 py-3 font-mono font-extrabold text-slate-900">{money(inv.subtotal_amount)}</td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold text-slate-700" colSpan={2}>
                        ضريبة القيمة المضافة (15%)
                      </td>
                      <td className="px-4 py-3 font-mono font-extrabold text-slate-900">
                        {inv.vat_applicable ? money(Number(inv.total_amount) - Number(inv.subtotal_amount)) : '0.00'}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td className="px-4 py-3 font-extrabold text-slate-900" colSpan={2}>
                        الإجمالي النهائي
                      </td>
                      <td className="px-4 py-3 font-mono text-lg font-black text-slate-900">{money(inv.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-bold text-slate-500">حالة الدفع</div>
                  <div className="mt-1 text-lg font-extrabold text-slate-900">{status}</div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                  <div className="text-xs font-bold text-emerald-700">المحصّل</div>
                  <div className="mt-1 text-lg font-extrabold text-emerald-900">{money(paid)}</div>
                </div>
                <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <div className="text-xs font-bold text-amber-800">المتبقي</div>
                  <div className="mt-1 text-lg font-extrabold text-amber-950">{money(remaining)}</div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <table className="w-full border-collapse text-sm invoice-table">
                  <thead className="bg-slate-50">
                    <tr className="text-right text-xs font-extrabold text-slate-700">
                      <th className="px-4 py-3">الدفعات</th>
                      <th className="px-4 py-3">التاريخ</th>
                      <th className="px-4 py-3">المبلغ</th>
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
                          لا توجد دفعات مسجلة على هذه الفاتورة بعد.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                ملاحظة تدقيقية: عرض المبالغ يستخدم تحويل هللات (cents) لضمان الدقة. الفاتورة نفسها تعتمد القيم المخزنة في قاعدة البيانات.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

