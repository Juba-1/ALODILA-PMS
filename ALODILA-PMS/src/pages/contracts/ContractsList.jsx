import { useEffect, useMemo, useState } from 'react'
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
import { getActiveProperties } from '../../lib/db/properties'
import { getTenants } from '../../lib/db/tenants'
import { getActiveUnits } from '../../lib/db/units'
import { createContract, getContracts, softDeleteContract, updateContract } from '../../lib/db/contracts'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import ContractForm from './ContractForm'
import { EmptyState } from '../../components/ui/EmptyState'
import { exportReportPdf } from '../../lib/print/targetedPdf'

const CONTRACT_STATUSES = ['ساري', 'منتهي', 'ملغى', 'نزاع قانوني']

function badge(status) {
  if (status === 'ساري') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'ملغى') return 'bg-red-50 text-red-700 ring-red-200'
  if (status === 'نزاع قانوني') return 'bg-amber-50 text-amber-800 ring-amber-200'
  if (status === 'منتهي') return 'bg-slate-100 text-slate-700 ring-slate-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

export default function ContractsList() {
  const { i18n } = useTranslation()
  const { push: toastPush } = useToastDispatch()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [q, setQ] = useState('')

  const [tenants, setTenants] = useState([])
  const [units, setUnits] = useState([])
  const [properties, setProperties] = useState([])
  const [refsBusy, setRefsBusy] = useState(true)

  const [filterPropertyId, setFilterPropertyId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [startFrom, setStartFrom] = useState('')
  const [startTo, setStartTo] = useState('')
  const [endFrom, setEndFrom] = useState('')
  const [endTo, setEndTo] = useState('')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)

  async function refresh() {
    setBusy(true)
    try {
      const data = await getContracts()
      setItems(data)
    } catch (e) {
      reportLoadFailure(toastPush, e, 'تعذر تحميل العقود', true)
    } finally {
      setBusy(false)
    }
  }

  async function refreshRefs() {
    setRefsBusy(true)
    try {
      const [t, u, p] = await Promise.all([getTenants(), getActiveUnits(), getActiveProperties()])
      setTenants(t)
      setUnits(u)
      setProperties(p)
    } catch (e) {
      reportLoadFailure(toastPush, e, 'تعذر تحميل البيانات المرتبطة', true)
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
    return items.filter((c) => {
      if (filterPropertyId && String(c.property_id || '') !== filterPropertyId) return false
      if (filterStatus && String(c.status || '') !== filterStatus) return false
      if (startFrom && String(c.start_date || '') < startFrom) return false
      if (startTo && String(c.start_date || '') > startTo) return false
      if (endFrom && String(c.end_date || '') < endFrom) return false
      if (endTo && String(c.end_date || '') > endTo) return false
      if (!needle) return true
      const hay = `${c.ejar_contract_number || ''} ${c.tenant_full_name || ''} ${c.unit_name || ''} ${c.property_name || ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q, filterPropertyId, filterStatus, startFrom, startTo, endFrom, endTo])

  const exportRows = useMemo(() => {
    return filtered.map((c) => ({
      'رقم عقد إيجار': c.ejar_contract_number || '',
      العقار: c.property_name || '',
      المستأجر: c.tenant_full_name || '',
      الوحدة: c.unit_name || '',
      البداية: c.start_date,
      النهاية: c.end_date,
      'قيمة العقد': c.contract_value,
      'خدمات (نوع الدفع)': c.utility_payment_type || 'مستقل',
      'خدمات مقطوع (ر.س)': c.utility_payment_type === 'مقطوع' ? c.utility_flat_amount_sar ?? '' : '',
      'ملاحظات الاستلام': c.handover_notes || '',
      الحالة: c.status,
    }))
  }, [filtered])
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(c) {
    setEditing({
      ...c,
      tenant_id: c?.tenant?.id || c.tenant_id,
      unit_id: c?.unit?.id || c.unit_id,
    })
    setOpen(true)
  }

  async function onSave(values) {
    if (!values.tenant_id || !values.unit_id || !values.start_date || !values.end_date) {
      toastPush({ type: 'error', title: 'تحقق من المدخلات', message: 'يرجى تعبئة الحقول الإلزامية.' })
      return
    }

    const contractValue = Number(values.contract_value)
    const deposit = Number(values.deposit ?? 0)
    if (!Number.isFinite(contractValue) || contractValue < 0 || !Number.isFinite(deposit) || deposit < 0) {
      toastPush({ type: 'error', title: 'تحقق من المدخلات', message: 'قيمة العقد/التأمين يجب أن تكون أرقامًا صحيحة.' })
      return
    }

    const uid = values.unit_id
    const excludeId = editing?.id
    const unitBlocked = items.some(
      (c) =>
        c.status === 'ساري' &&
        c.id !== excludeId &&
        String(c.unit_id || c?.unit?.id || '') === String(uid),
    )
    if (values.status === 'ساري' && unitBlocked) {
      toastPush({
        type: 'error',
        title: 'تعارض على الوحدة',
        message: 'لا يمكن حفظ عقد ساري على وحدة عليها عقد ساري آخر. اختر وحدة شاغرة أو غيّر الحالة.',
      })
      return
    }

    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateContract(editing.id, values)
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        toastPush({ type: 'success', title: 'تم التحديث', message: 'تم تحديث العقد بنجاح.' })
      } else {
        const created = await createContract(values)
        setItems((prev) => [created, ...prev])
        toastPush({ type: 'success', title: 'تم الإنشاء', message: 'تم إنشاء العقد بنجاح.' })
      }
      setOpen(false)
      setEditing(null)
    } catch (e) {
      reportLoadFailure(toastPush, e, 'فشل الحفظ', true)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id) {
    const ok = window.confirm('هل تريد إخفاء هذا العقد؟')
    if (!ok) return
    try {
      await softDeleteContract(id)
      setItems((prev) => prev.filter((x) => x.id !== id))
      toastPush({ type: 'success', title: 'تم الإخفاء', message: 'تم إخفاء العقد بنجاح.' })
    } catch (e) {
      reportLoadFailure(toastPush, e, 'فشل الإخفاء', true)
    }
  }

  return (
    <div className="max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>العقود</CardTitle>
              <CardDescription>ربط الوحدات بالمستأجرين وإدارة دورات الدفع والحالة</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={exportRows} filename="تصدير-العقود" disabled={busy} />
              <ExportButton rows={exportRows} filename="تصدير-العقود" format="csv" disabled={busy} />
              <TargetedPdfButton
                label="طباعة / PDF"
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: dir === 'ltr' ? 'Leases' : 'العقود',
                    subtitle: dir === 'ltr' ? 'Lease list export' : 'تصدير قائمة العقود',
                    filename: 'contracts',
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
                إنشاء عقد
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>بحث</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث برقم عقد إيجار/المستأجر/الوحدة..." />
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                الإجمالي: <span className="font-bold text-slate-900">{filtered.length}</span>
              </div>
            </div>
          </div>

          <AdvancedFilterBar>
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
              <Label>حالة العقد</Label>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">كل الحالات</option>
                {CONTRACT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>بداية العقد من</Label>
              <Input type="date" value={startFrom} onChange={(e) => setStartFrom(e.target.value)} />
            </div>
            <div>
              <Label>بداية العقد إلى</Label>
              <Input type="date" value={startTo} onChange={(e) => setStartTo(e.target.value)} />
            </div>
            <div>
              <Label>نهاية العقد من</Label>
              <Input type="date" value={endFrom} onChange={(e) => setEndFrom(e.target.value)} />
            </div>
            <div>
              <Label>نهاية العقد إلى</Label>
              <Input type="date" value={endTo} onChange={(e) => setEndTo(e.target.value)} />
            </div>
          </AdvancedFilterBar>

          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-right text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">رقم عقد إيجار</th>
                    <th className="px-4 py-3">العقار</th>
                    <th className="px-4 py-3">المستأجر</th>
                    <th className="px-4 py-3">الوحدة</th>
                    <th className="px-4 py-3">البداية</th>
                    <th className="px-4 py-3">النهاية</th>
                    <th className="px-4 py-3">قيمة العقد</th>
                    <th className="px-4 py-3">الخدمات</th>
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
                      <td colSpan={10} className="p-6">
                        <EmptyState
                          icon="📄"
                          title={items.length === 0 ? 'لا توجد عقود بعد' : 'لا توجد عقود مطابقة للمرشحات'}
                          description={
                            items.length === 0
                              ? 'أنشئ عقداً لربط وحدة بمستأجر وإصدار الفواتير لاحقاً.'
                              : 'عدّل البحث أو امسح مرشحات التاريخ والعقار لعرض المزيد.'
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">{c.ejar_contract_number || '-'}</td>
                        <td className="px-4 py-3 text-slate-800">{c.property_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-800">{c.tenant_full_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-800">{c.unit_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{c.start_date}</td>
                        <td className="px-4 py-3 text-slate-700">{c.end_date}</td>
                        <td className="px-4 py-3 text-slate-700">{c.contract_value}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <span className="font-semibold">{c.utility_payment_type || 'مستقل'}</span>
                          {c.utility_payment_type === 'مقطوع' && c.utility_flat_amount_sar != null ? (
                            <span className="ms-1 text-xs text-slate-500"> (+{c.utility_flat_amount_sar} ر.س)</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${badge(c.status)}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button variant="subtle" size="sm" onClick={() => openEdit(c)} disabled={refsBusy}>
                              تعديل
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => onDelete(c.id)}>
                              إخفاء
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => (saving ? null : setOpen(false))} title="عقد إيجار">
        <ContractForm
          key={editing?.id || 'create'}
          initialValue={editing}
          tenants={tenants}
          units={units}
          existingContracts={items}
          busy={saving}
          onSubmit={onSave}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </div>
  )
}

