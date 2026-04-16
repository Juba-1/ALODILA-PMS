import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AdvancedFilterBar } from '../../components/AdvancedFilterBar'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { paymentStatusOfInvoice } from '../../lib/finance/invoiceDerived'
import { getActiveContractsForSelect } from '../../lib/db/contracts'
import { getActiveProperties } from '../../lib/db/properties'
import { createInvoice, getInvoices, softDeleteInvoice, updateInvoice } from '../../lib/db/invoices'
import InvoiceForm from './InvoiceForm'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import PaymentModal from './PaymentModal'
import { exportReportPdf } from '../../lib/print/targetedPdf'

function badge(status) {
  if (status === 'مدفوعة بالكامل') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'مدفوعة جزئياً') return 'bg-amber-50 text-amber-800 ring-amber-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

export default function InvoicesList() {
  const { i18n } = useTranslation()
  const { push } = useToastDispatch()

  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [q, setQ] = useState('')

  const [contracts, setContracts] = useState([])
  const [properties, setProperties] = useState([])
  const [refsBusy, setRefsBusy] = useState(true)

  const [filterPay, setFilterPay] = useState('')
  const [filterPropertyId, setFilterPropertyId] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)

  const [payOpen, setPayOpen] = useState(false)
  const [payInvoice, setPayInvoice] = useState(null)

  async function refresh() {
    setBusy(true)
    try {
      const data = await getInvoices()
      setItems(data)
    } catch (e) {
      reportLoadFailure(push, e, 'تعذر تحميل الفواتير', true)
    } finally {
      setBusy(false)
    }
  }

  async function refreshRefs() {
    setRefsBusy(true)
    try {
      const [c, p] = await Promise.all([getActiveContractsForSelect(), getActiveProperties()])
      setContracts(c)
      setProperties(p)
    } catch (e) {
      reportLoadFailure(push, e, 'تعذر تحميل العقود', true)
    } finally {
      setRefsBusy(false)
    }
  }

  useEffect(() => {
    refresh()
    refreshRefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((inv) => {
      const st = paymentStatusOfInvoice(inv)
      if (filterPay === 'paid' && st !== 'مدفوعة بالكامل') return false
      if (filterPay === 'partial' && st !== 'مدفوعة جزئياً') return false
      if (filterPay === 'unpaid' && st !== 'غير مدفوعة') return false
      if (filterPropertyId && String(inv.property_id || '') !== filterPropertyId) return false
      if (dueFrom && String(inv.due_date || '') < dueFrom) return false
      if (dueTo && String(inv.due_date || '') > dueTo) return false
      if (!needle) return true
      const hay = `${inv.id} ${inv.tenant_full_name || ''} ${inv.unit_name || ''} ${inv.property_name || ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q, filterPay, filterPropertyId, dueFrom, dueTo])

  const exportRows = useMemo(() => {
    return filtered.map((inv) => {
      const st = paymentStatusOfInvoice(inv)
      return {
        'رقم المطالبة': inv.id,
        العقار: inv.property_name || '',
        المستأجر: inv.tenant_full_name || '',
        الوحدة: inv.unit_name || '',
        'تاريخ الاستحقاق': inv.due_date,
        'قبل الضريبة': inv.subtotal_amount,
        ضريبة: inv.vat_applicable ? 'نعم' : 'لا',
        الإجمالي: inv.total_amount,
        'حالة الدفع': st,
      }
    })
  }, [filtered])
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(inv) {
    setEditing(inv)
    setOpen(true)
  }

  async function onSave(values) {
    if (!values.contract_id || !values.due_date) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'يرجى تعبئة الحقول الإلزامية.' })
      return
    }
    const sub = Number(values.subtotal_amount)
    const total = Number(values.total_amount)
    if (!Number.isFinite(sub) || sub < 0 || !Number.isFinite(total) || total < 0) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'المبالغ يجب أن تكون أرقامًا صحيحة.' })
      return
    }

    const payload = {
      contract_id: values.contract_id,
      due_date: values.due_date,
      subtotal_amount: Math.round(sub * 100) / 100,
      vat_applicable: Boolean(values.vat_applicable),
      total_amount: Math.round(total * 100) / 100,
    }

    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateInvoice(editing.id, payload)
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        push({ type: 'success', title: 'تم التحديث', message: 'تم تحديث الفاتورة بنجاح.' })
      } else {
        const created = await createInvoice(payload)
        setItems((prev) => [created, ...prev])
        push({ type: 'success', title: 'تم الإنشاء', message: 'تم إنشاء الفاتورة بنجاح.' })
      }
      setOpen(false)
    } catch (e) {
      console.error('[InvoicesList] onSave', e)
      reportLoadFailure(push, e, 'فشل الحفظ', true)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id) {
    const ok = window.confirm('هل تريد إخفاء هذه الفاتورة؟')
    if (!ok) return
    try {
      await softDeleteInvoice(id)
      setItems((prev) => prev.filter((x) => x.id !== id))
      push({ type: 'success', title: 'تم الإخفاء', message: 'تم إخفاء الفاتورة بنجاح.' })
    } catch (e) {
      console.error('[InvoicesList] onDelete', e)
      reportLoadFailure(push, e, 'فشل الإخفاء', true)
    }
  }

  function openPayment(inv) {
    setPayInvoice(inv)
    setPayOpen(true)
  }

  return (
    <div className="max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>المالية — دفعات الإيجار المستحقة</CardTitle>
              <CardDescription>إصدار مطالبات إيجار وتسجيل دفعات جزئية/كاملة بدون غرامات تأخير</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={exportRows} filename="تصدير-المطالبات" disabled={busy} />
              <TargetedPdfButton
                label="طباعة / PDF"
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: dir === 'ltr' ? 'Invoices' : 'المطالبات (الفواتير)',
                    subtitle: dir === 'ltr' ? 'Invoice list export' : 'تصدير قائمة المطالبات',
                    filename: 'invoices',
                    metaLines: [
                      `${dir === 'ltr' ? 'Date' : 'التاريخ'}: ${new Date().toISOString().slice(0, 10)}`,
                      `${dir === 'ltr' ? 'Rows' : 'عدد الصفوف'}: ${exportRows.length}`,
                    ],
                    rows: exportRows,
                    dir,
                  })
                }
              />
              <Button variant="gold" onClick={openCreate} disabled={refsBusy}>
                إصدار مطالبة إيجار
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>بحث</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث برقم الفاتورة/المستأجر/الوحدة..." />
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                الإجمالي: <span className="font-bold text-slate-900">{filtered.length}</span>
              </div>
            </div>
          </div>

          <AdvancedFilterBar>
            <div>
              <Label>حالة الدفع</Label>
              <Select value={filterPay} onChange={(e) => setFilterPay(e.target.value)}>
                <option value="">الكل</option>
                <option value="paid">مدفوعة بالكامل</option>
                <option value="partial">مدفوعة جزئياً</option>
                <option value="unpaid">غير مدفوعة</option>
              </Select>
            </div>
            <div>
              <Label>العقار</Label>
              <Select value={filterPropertyId} onChange={(e) => setFilterPropertyId(e.target.value)}>
                <option value="">كل العقارات</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>استحقاق من</Label>
              <Input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
            </div>
            <div>
              <Label>استحقاق إلى</Label>
              <Input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
            </div>
          </AdvancedFilterBar>

          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-right text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">رقم المطالبة</th>
                    <th className="px-4 py-3">العقار</th>
                    <th className="px-4 py-3">المستأجر</th>
                    <th className="px-4 py-3">الوحدة</th>
                    <th className="px-4 py-3">تاريخ الاستحقاق</th>
                    <th className="px-4 py-3">قبل الضريبة</th>
                    <th className="px-4 py-3">ضريبة</th>
                    <th className="px-4 py-3">الإجمالي</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {busy ? (
                    Array.from({ length: 7 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 10 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-full max-w-[10rem] animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                        لا توجد فواتير بعد.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((inv) => {
                      const st = paymentStatusOfInvoice(inv)
                      return (
                        <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="px-4 py-3 font-bold text-slate-900">
                            <Link to={`/invoices/${inv.id}`} className="hover:underline">
                              {inv.id}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-800">{inv.property_name || '-'}</td>
                          <td className="px-4 py-3 text-slate-800">{inv.tenant_full_name || '-'}</td>
                          <td className="px-4 py-3 text-slate-800">{inv.unit_name || '-'}</td>
                          <td className="px-4 py-3 text-slate-700">{inv.due_date}</td>
                          <td className="px-4 py-3 text-slate-700">{inv.subtotal_amount}</td>
                          <td className="px-4 py-3 text-slate-700">{inv.vat_applicable ? 'نعم' : 'لا'}</td>
                          <td className="px-4 py-3 text-slate-700">{inv.total_amount}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${badge(st)}`}>
                              {st}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <Link to={`/invoices/${inv.id}`}>
                                <Button variant="subtle" size="sm" type="button">
                                  عرض/طباعة
                                </Button>
                              </Link>
                              <Button variant="gold" size="sm" onClick={() => openPayment(inv)}>
                                تسجيل دفعة
                              </Button>
                              <Button variant="subtle" size="sm" onClick={() => openEdit(inv)}>
                                تعديل
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onDelete(inv.id)}>
                                إخفاء
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => (saving ? null : setOpen(false))}>
        <InvoiceForm initialValue={editing} contracts={contracts} busy={saving} onSubmit={onSave} onCancel={() => setOpen(false)} />
      </Modal>

      <PaymentModal open={payOpen} invoice={payInvoice} onClose={() => setPayOpen(false)} onSaved={() => refresh()} />
    </div>
  )
}

