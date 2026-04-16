import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Link } from 'react-router-dom'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import TenantForm from './TenantForm'
import { createTenant, getTenants, softDeleteTenant, updateTenant } from '../../lib/db/tenants'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { exportReportPdf } from '../../lib/print/targetedPdf'

function normalizePhoneForWa(phone) {
  const raw = String(phone || '').trim()
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  // Saudi normalization (approved):
  // - 05XXXXXXXX -> 9665XXXXXXXX
  // - +966..., 00966... -> 966...
  // Keep other international numbers intact.
  if (digits.startsWith('00966')) return '966' + digits.slice(5)
  if (digits.startsWith('966')) return digits
  if (digits.startsWith('05') && digits.length >= 10) return '966' + digits.slice(1) // drop leading 0
  return digits
}

function whatsappUrl(phone) {
  const normalized = normalizePhoneForWa(phone)
  return normalized ? `https://wa.me/${normalized}` : null
}

function tenantTypeLabel(v) {
  if (v === 'individual') return 'فرد'
  if (v === 'company') return 'شركة'
  return v || '-'
}

function WhatsAppButton({ phone }) {
  const url = whatsappUrl(phone)
  if (!url) return <span className="text-slate-400">-</span>

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
      title="فتح واتساب"
    >
      <svg width="16" height="16" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
        <path d="M19.11 17.39c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.72-1.35-1.6-1.51-1.87-.16-.27-.02-.41.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.48-.84-2.03-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27 0 1.34.97 2.64 1.11 2.82.14.18 1.9 2.9 4.61 4.06.65.28 1.16.45 1.56.58.66.21 1.26.18 1.74.11.53-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32z" />
        <path d="M26.4 5.6C23.9 3.1 20.6 1.7 17.1 1.7c-7.3 0-13.2 5.9-13.2 13.2 0 2.3.6 4.5 1.7 6.5L3.8 30l8.8-1.7c1.9 1.1 4.1 1.7 6.4 1.7 7.3 0 13.2-5.9 13.2-13.2 0-3.5-1.4-6.8-3.8-9.2zM17.1 27.8c-2 0-4-.5-5.7-1.6l-.4-.2-5.2 1 1-5.1-.3-.5c-1.1-1.7-1.6-3.7-1.6-5.7 0-6 4.9-10.9 10.9-10.9 2.9 0 5.6 1.1 7.7 3.2 2 2 3.2 4.8 3.2 7.7 0 6-4.9 10.9-10.9 10.9z" />
      </svg>
      واتساب
    </a>
  )
}

export default function TenantsList() {
  const { i18n } = useTranslation()
  const { push: toastPush } = useToastDispatch()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [q, setQ] = useState('')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)

  async function refresh() {
    setBusy(true)
    try {
      const data = await getTenants()
      setItems(data)
    } catch (e) {
      if (!isIgnorableAuthLockError(e)) console.error('[TenantsList] refresh', e)
      reportLoadFailure(toastPush, e, 'تعذر تحميل المستأجرين', true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((t) => {
      const hay = `${t.full_name || ''} ${t.national_id_or_cr || ''} ${t.phone || ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q])

  const exportRows = useMemo(() => {
    return filtered.map((t) => ({
      'الهوية/السجل': t.national_id_or_cr,
      الاسم: t.full_name,
      النوع: tenantTypeLabel(t.tenant_type),
      الجوال: t.phone,
    }))
  }, [filtered])
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(t) {
    setEditing(t)
    setOpen(true)
  }

  async function onSave(values) {
    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateTenant(editing.id, values)
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        toastPush({ type: 'success', title: 'تم التحديث', message: 'تم تحديث بيانات المستأجر بنجاح.' })
      } else {
        const created = await createTenant(values)
        setItems((prev) => [created, ...prev])
        toastPush({ type: 'success', title: 'تمت الإضافة', message: 'تم إضافة المستأجر بنجاح.' })
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
    const ok = window.confirm('هل تريد إخفاء هذا المستأجر؟')
    if (!ok) return
    try {
      await softDeleteTenant(id)
      setItems((prev) => prev.filter((x) => x.id !== id))
      toastPush({ type: 'success', title: 'تم الإخفاء', message: 'تم إخفاء المستأجر بنجاح.' })
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
              <CardTitle>المستأجرين</CardTitle>
              <CardDescription>نظام CRM لإدارة بيانات المستأجرين قبل ربطهم بالعقود</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={exportRows} filename="تصدير-المستأجرين" disabled={busy} />
              <ExportButton rows={exportRows} filename="تصدير-المستأجرين" format="csv" disabled={busy} />
              <TargetedPdfButton
                label="طباعة / PDF"
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: dir === 'ltr' ? 'Tenants' : 'المستأجرين',
                    subtitle: dir === 'ltr' ? 'Tenant master list' : 'قائمة المستأجرين (CRM)',
                    filename: 'tenants',
                    metaLines: [
                      `${dir === 'ltr' ? 'Date' : 'التاريخ'}: ${new Date().toISOString().slice(0, 10)}`,
                      `${dir === 'ltr' ? 'Rows' : 'عدد الصفوف'}: ${exportRows.length}`,
                    ],
                    rows: exportRows,
                    dir,
                  })
                }
              />
              <Button variant="gold" onClick={openCreate}>
                إضافة مستأجر
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>بحث</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم/الهوية/الجوال..." />
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                الإجمالي: <span className="font-bold text-slate-900">{filtered.length}</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-right text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">رقم الهوية/السجل</th>
                    <th className="px-4 py-3">الاسم الكامل</th>
                    <th className="px-4 py-3">نوع المستأجر</th>
                    <th className="px-4 py-3">رقم الجوال</th>
                    <th className="px-4 py-3">واتساب</th>
                    <th className="px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {busy ? (
                    Array.from({ length: 7 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-full max-w-[10rem] animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6">
                        <EmptyState
                          icon="👤"
                          title={items.length === 0 ? 'لا يوجد مستأجرون بعد' : 'لا توجد نتائج للبحث'}
                          description={
                            items.length === 0
                              ? 'أضف أول مستأجر لربطه لاحقاً بالعقود والفواتير.'
                              : 'جرّب تعديل عبارة البحث أو امسح الحقل لعرض القائمة كاملة.'
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => (
                      <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">{t.national_id_or_cr}</td>
                        <td className="px-4 py-3 text-slate-800">{t.full_name}</td>
                        <td className="px-4 py-3 text-slate-700">{tenantTypeLabel(t.tenant_type)}</td>
                        <td className="px-4 py-3 text-slate-700">{t.phone}</td>
                        <td className="px-4 py-3">
                          <WhatsAppButton phone={t.phone} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button variant="subtle" size="sm" onClick={() => openEdit(t)}>
                              تعديل
                            </Button>
                            <Link to={`/tenants/${t.id}/statement`}>
                              <Button variant="ghost" size="sm" type="button">
                                كشف حساب
                              </Button>
                            </Link>
                            <Button variant="ghost" size="sm" onClick={() => onDelete(t.id)}>
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

      <Modal open={open} onClose={() => (saving ? null : setOpen(false))}>
        <TenantForm initialValue={editing} busy={saving} onSubmit={onSave} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  )
}

