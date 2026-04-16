import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { suggestedInvoiceSubtotalFromContract } from '../../lib/finance/contractInvoiceBase'

export default function InvoiceForm({ initialValue, contracts, busy, onSubmit, onCancel }) {
  const isEdit = Boolean(initialValue?.id)

  const [contractId, setContractId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [subtotal, setSubtotal] = useState('')
  const [vat, setVat] = useState(false)

  const title = useMemo(() => (isEdit ? 'تعديل مطالبة إيجار' : 'إصدار مطالبة إيجار'), [isEdit])

  useEffect(() => {
    setContractId(initialValue?.contract_id || '')
    setDueDate(initialValue?.due_date || '')
    setSubtotal(initialValue?.subtotal_amount != null ? String(initialValue.subtotal_amount) : '')
    setVat(Boolean(initialValue?.vat_applicable))
  }, [initialValue])

  useEffect(() => {
    if (isEdit) return
    if (!contractId) return
    const c = contracts.find((x) => x.id === contractId)
    if (!c) return
    const suggested = suggestedInvoiceSubtotalFromContract(c)
    setSubtotal(String(suggested))
  }, [contractId, contracts, isEdit])

  const selectedContract = useMemo(() => contracts.find((x) => x.id === contractId), [contracts, contractId])

  const subtotalNum = Number(subtotal || 0)
  const total = useMemo(() => {
    const base = Number.isFinite(subtotalNum) && subtotalNum >= 0 ? subtotalNum : 0
    if (!vat) return Math.round(base * 100) / 100
    return Math.round(base * 1.15 * 100) / 100
  }, [subtotalNum, vat])

  return (
    <>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>إصدار مطالبة مع حساب تلقائي للضريبة (15%) عند تفعيلها</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit?.({
              contract_id: contractId,
              due_date: dueDate,
              subtotal_amount: subtotal,
              vat_applicable: vat,
              total_amount: total,
            })
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Label>اختيار العقد (إلزامي)</Label>
            <Select value={contractId} onChange={(e) => setContractId(e.target.value)} required>
              <option value="" disabled>
                اختر العقد...
              </option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tenant_full_name} — {c.unit_name}
                  {c.ejar_contract_number ? ` — (${c.ejar_contract_number})` : ''}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>تاريخ الاستحقاق (إلزامي)</Label>
            <Input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" required />
          </div>

          <div>
            <Label>المبلغ قبل الضريبة (إلزامي)</Label>
            <Input value={subtotal} onChange={(e) => setSubtotal(e.target.value)} type="number" min={0} step="0.01" required />
            {!isEdit && selectedContract?.utility_payment_type === 'مقطوع' ? (
              <p className="mt-1 text-xs text-slate-600">
                يتضمن هذا المقترح قيمة الإيجار المعتمدة في العقد زائد المبلغ المقطوع للخدمات ({selectedContract.utility_flat_amount_sar}{' '}
                ر.س) — يمكنك تعديل المبلغ إذا لزم.
              </p>
            ) : !isEdit && contractId ? (
              <p className="mt-1 text-xs text-slate-500">تمت المطابقة مع قيمة العقد؛ عدّل يدوياً عند الحاجة.</p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <input
                type="checkbox"
                checked={vat}
                onChange={(e) => setVat(e.target.checked)}
                className="h-4 w-4 accent-slate-900"
              />
              <div>
                <div className="text-sm font-bold text-slate-900">خاضع للضريبة</div>
                <div className="mt-0.5 text-xs text-slate-600">سيتم إضافة 15% تلقائياً إلى الإجمالي</div>
              </div>
            </label>
          </div>

          <div className="sm:col-span-2">
            <Label>الإجمالي (محسوب تلقائياً)</Label>
            <Input value={Number.isFinite(total) ? total.toFixed(2) : '0.00'} readOnly />
          </div>

          <div className="sm:col-span-2 flex gap-3 pt-2">
            <Button variant="gold" className="flex-1" type="submit" disabled={busy}>
              {busy ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
            <Button variant="subtle" className="flex-1" type="button" onClick={onCancel} disabled={busy}>
              إلغاء
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  )
}

