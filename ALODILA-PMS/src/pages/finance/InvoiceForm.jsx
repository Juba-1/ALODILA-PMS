import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { suggestedInvoiceSubtotalFromContract } from '../../lib/finance/contractInvoiceBase'

export default function InvoiceForm({ initialValue, contracts, busy, onSubmit, onCancel }) {
  const { t } = useTranslation()
  const isEdit = Boolean(initialValue?.id)

  const [contractId, setContractId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [subtotal, setSubtotal] = useState('')
  const [vat, setVat] = useState(false)

  const title = useMemo(
    () => (isEdit ? t('invoiceForm.titleEdit') : t('invoiceForm.titleCreate')),
    [isEdit, t]
  )

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
        <CardDescription>{t('invoiceForm.desc')}</CardDescription>
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
            <Label>{t('invoiceForm.contractLabel')}</Label>
            <Select value={contractId} onChange={(e) => setContractId(e.target.value)} required>
              <option value="" disabled>
                {t('invoiceForm.contractPlaceholder')}
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
            <Label>{t('invoiceForm.dueDate')}</Label>
            <Input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" required />
          </div>

          <div>
            <Label>{t('invoiceForm.subtotal')}</Label>
            <Input value={subtotal} onChange={(e) => setSubtotal(e.target.value)} type="number" min={0} step="0.01" required />
            {!isEdit && selectedContract?.utility_payment_type === 'مقطوع' ? (
              <p className="mt-1 text-xs text-slate-600">
                {t('invoiceForm.suggestionFlatUtility', { amount: selectedContract.utility_flat_amount_sar })}
              </p>
            ) : !isEdit && contractId ? (
              <p className="mt-1 text-xs text-slate-500">{t('invoiceForm.suggestionMatched')}</p>
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
                <div className="text-sm font-bold text-slate-900">{t('invoiceForm.vatLabel')}</div>
                <div className="mt-0.5 text-xs text-slate-600">{t('invoiceForm.vatHint')}</div>
              </div>
            </label>
          </div>

          <div className="sm:col-span-2">
            <Label>{t('invoiceForm.total')}</Label>
            <Input value={Number.isFinite(total) ? total.toFixed(2) : '0.00'} readOnly />
          </div>

          <div className="sm:col-span-2 flex gap-3 pt-2">
            <Button variant="gold" className="flex-1" type="submit" disabled={busy}>
              {busy ? t('invoiceForm.saving') : t('invoiceForm.save')}
            </Button>
            <Button variant="subtle" className="flex-1" type="button" onClick={onCancel} disabled={busy}>
              {t('invoiceForm.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  )
}
