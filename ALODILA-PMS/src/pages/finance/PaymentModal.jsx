import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { createPayment, getPaymentsByInvoiceId } from '../../lib/db/payments'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'

export default function PaymentModal({ open, invoice, onClose, onSaved }) {
  const { push } = useToastDispatch()
  const pushRef = useRef(push)
  pushRef.current = push

  const [busy, setBusy] = useState(false)
  const [payments, setPayments] = useState([])
  const [paymentDate, setPaymentDate] = useState('')
  const [amount, setAmount] = useState('')

  const total = Number(invoice?.total_amount || 0)

  const paid = (payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const remaining = Math.max(0, total - paid)

  useEffect(() => {
    if (!open || !invoice?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await getPaymentsByInvoiceId(invoice.id)
        if (!cancelled) setPayments(list)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure((p) => pushRef.current?.(p), e, 'تعذر تحميل الدفعات', true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, invoice?.id])

  useEffect(() => {
    if (!open) return
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setAmount('')
  }, [open])

  async function onSubmit(e) {
    e.preventDefault()
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'المبلغ يجب أن يكون أكبر من صفر.' })
      return
    }

    setBusy(true)
    try {
      await createPayment({
        invoice_id: invoice.id,
        payment_date: paymentDate,
        amount: amt,
      })
      push({ type: 'success', title: 'تم تسجيل الدفعة', message: 'تم حفظ الدفعة بنجاح.' })
      onSaved?.()
      onClose?.()
    } catch (e) {
      reportLoadFailure(push, e, 'فشل تسجيل الدفعة', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={() => (busy ? null : onClose?.())}>
      <CardHeader>
        <CardTitle>تسجيل دفعة</CardTitle>
        <CardDescription>تسجيل دفعة جزئية/كاملة بدون أي غرامات تأخير</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-bold text-slate-500">إجمالي الفاتورة</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900">{total.toFixed(2)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-bold text-slate-500">المدفوع</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900">{paid.toFixed(2)}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-bold text-slate-500">المتبقي</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900">{remaining.toFixed(2)}</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>تاريخ الدفعة (إلزامي)</Label>
            <Input value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} type="date" required />
          </div>
          <div>
            <Label>المبلغ (إلزامي)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={0} step="0.01" required />
          </div>

          <div className="sm:col-span-2 flex gap-3 pt-2">
            <Button variant="gold" className="flex-1" type="submit" disabled={busy}>
              {busy ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
            <Button variant="subtle" className="flex-1" type="button" onClick={onClose} disabled={busy}>
              إلغاء
            </Button>
          </div>
        </form>
      </CardContent>
    </Modal>
  )
}
