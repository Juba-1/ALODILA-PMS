import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { createOwner, getOwners, softDeleteOwner, updateOwner } from '../../lib/db/owners'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import { exportReportPdf } from '../../lib/print/targetedPdf'

export default function OwnersList() {
  const { i18n } = useTranslation()
  const { push: toastPush } = useToastDispatch()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [phone, setPhone] = useState('')

  async function refresh() {
    setBusy(true)
    try {
      const data = await getOwners()
      setItems(data)
    } catch (e) {
      reportLoadFailure(toastPush, e, 'تعذر تحميل الملاك', true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return items
    return items.filter((o) => `${o.full_name} ${o.national_id} ${o.phone}`.toLowerCase().includes(n))
  }, [items, q])

  function openCreate() {
    setEditing(null)
    setFullName('')
    setNationalId('')
    setPhone('')
    setModalOpen(true)
  }

  function openEdit(o) {
    setEditing(o)
    setFullName(o.full_name || '')
    setNationalId(o.national_id || '')
    setPhone(o.phone || '')
    setModalOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    const fn = fullName.trim()
    const nid = nationalId.trim()
    const ph = phone.trim()
    if (!fn || !nid || !ph) {
      toastPush({ type: 'error', title: 'تحقق من المدخلات', message: 'الاسم والهوية والجوال إلزامية.' })
      return
    }
    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateOwner(editing.id, { full_name: fn, phone: ph })
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        toastPush({ type: 'success', title: 'تم التحديث', message: 'تم تحديث بيانات المالك.' })
      } else {
        const created = await createOwner({ full_name: fn, national_id: nid, phone: ph })
        setItems((prev) => [...prev, created].sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))))
        toastPush({ type: 'success', title: 'تمت الإضافة', message: 'تم إضافة المالك إلى CRM.' })
      }
      setModalOpen(false)
      setEditing(null)
    } catch (err) {
      reportLoadFailure(toastPush, err, 'فشل الحفظ', true)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id) {
    if (!window.confirm('هل تريد إخفاء هذا المالك؟')) return
    try {
      await softDeleteOwner(id)
      setItems((prev) => prev.filter((x) => x.id !== id))
      toastPush({ type: 'success', title: 'تم الإخفاء', message: 'تم إخفاء المالك.' })
    } catch (err) {
      reportLoadFailure(toastPush, err, 'فشل الإخفاء', true)
    }
  }

  const exportRows = useMemo(
    () => filtered.map((o) => ({ الاسم: o.full_name, الهوية: o.national_id, الجوال: o.phone })),
    [filtered],
  )
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'

  return (
    <div className="max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>الملاك (CRM)</CardTitle>
              <CardDescription>إدارة ملاك العقارات المرتبطين بالعقود والبوابة عند التفعيل</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExportButton rows={exportRows} filename="تصدير-الملاك" disabled={busy} />
              <TargetedPdfButton
                label="طباعة / PDF"
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: dir === 'ltr' ? 'Owners (CRM)' : 'الملاك (CRM)',
                    subtitle: dir === 'ltr' ? 'Owner master list' : 'قائمة ملاك CRM',
                    filename: 'owners',
                    metaLines: [
                      `${dir === 'ltr' ? 'Date' : 'التاريخ'}: ${new Date().toISOString().slice(0, 10)}`,
                      `${dir === 'ltr' ? 'Rows' : 'عدد الصفوف'}: ${exportRows.length}`,
                    ],
                    rows: exportRows,
                    dir,
                  })
                }
              />
              <Button variant="gold" onClick={openCreate} disabled={busy}>
                إضافة مالك
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label>بحث</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الهوية أو الجوال..." />
          </div>
          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr className="text-right text-xs font-bold text-slate-600">
                  <th className="px-4 py-3">الاسم</th>
                  <th className="px-4 py-3">الهوية / السجل</th>
                  <th className="px-4 py-3">الجوال</th>
                  <th className="px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {busy ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      لا توجد نتائج. أنشئ مالكاً جديداً أو عدّل البحث.
                    </td>
                  </tr>
                ) : (
                  filtered.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-slate-900">{o.full_name}</td>
                      <td className="px-4 py-3 text-slate-700">{o.national_id}</td>
                      <td className="px-4 py-3 text-slate-700">{o.phone}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="subtle" size="sm" type="button" onClick={() => openEdit(o)}>
                            تعديل
                          </Button>
                          <Button variant="ghost" size="sm" type="button" onClick={() => onDelete(o.id)}>
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
          <p className="mt-4 text-xs text-slate-500">لربط مالك بعقار: من صفحة العقار اختر المالك من القائمة أو أضف مالكاً سريعاً.</p>
        </CardContent>
      </Card>

      <Modal open={modalOpen} onClose={() => (saving ? null : setModalOpen(false))} title={editing ? 'تعديل مالك' : 'إضافة مالك'}>
        <CardHeader>
          <CardTitle>{editing ? 'تعديل مالك' : 'إضافة مالك'}</CardTitle>
          <CardDescription>بيانات الملف التعريفي للمالك في CRM</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-3">
            <div>
              <Label>الاسم الكامل</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <Label>رقم الهوية / السجل</Label>
              <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} required readOnly={Boolean(editing)} />
            </div>
            <div>
              <Label>رقم الجوال</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            {editing ? <p className="text-xs text-slate-500">لا يمكن تغيير رقم الهوية/السجل بعد الإنشاء (مفتاح فريد).</p> : null}
            <div className="flex gap-2 pt-2">
              <Button variant="gold" type="submit" className="flex-1" disabled={saving}>
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
              <Button variant="subtle" type="button" className="flex-1" onClick={() => setModalOpen(false)} disabled={saving}>
                إلغاء
              </Button>
            </div>
          </form>
        </CardContent>
      </Modal>
    </div>
  )
}
