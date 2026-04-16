import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { EmptyState } from '../../components/ui/EmptyState'
import { getActiveProperties, softDeleteProperty } from '../../lib/db/properties'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { exportReportPdf } from '../../lib/print/targetedPdf'

function typeLabel(t) {
  if (t === 'Residential') return 'سكني'
  if (t === 'Commercial') return 'تجاري'
  if (t === 'Mixed') return 'مختلط'
  return t
}

export default function PropertiesList() {
  const { i18n } = useTranslation()
  const { push } = useToastDispatch()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setBusy(true)
        setError(null)
        const data = await getActiveProperties()
        if (mounted) setItems(data)
      } catch (e) {
        if (mounted && !isIgnorableAuthLockError(e)) {
          setError(e?.message || 'حدث خطأ.')
        }
      } finally {
        if (mounted) setBusy(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  async function onSoftDelete(id) {
    const ok = window.confirm('هل تريد إخفاء هذا العقار؟')
    if (!ok) return

    setError(null)
    setDeletingId(id)
    try {
      await softDeleteProperty(id)
      setItems((prev) => prev.filter((p) => p.id !== id))
      push({ type: 'success', title: 'تم الإخفاء', message: 'تم إخفاء العقار بنجاح.' })
    } catch (e) {
      if (!isIgnorableAuthLockError(e)) {
        setError(e?.message || 'فشل حذف/إخفاء العقار.')
      }
      reportLoadFailure(push, e, 'فشل الإخفاء', true)
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = items.filter((p) => {
    const hay = `${p.name || ''} ${p.category || ''} ${p.type || ''} ${p.deed_number || ''}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })

  const exportRows = useMemo(() => {
    return filtered.map((p) => ({
      الاسم: p.name,
      التصنيف: p.category,
      النوع: typeLabel(p.type),
      'رقم الصك': p.deed_number || '',
      الخريطة: p.maps_link || '',
      السعة: p.total_units_capacity,
    }))
  }, [filtered])
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'

  return (
    <div className="max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>العقارات</CardTitle>
              <CardDescription>قائمة العقارات النشطة</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExportButton rows={exportRows} filename="تصدير-العقارات" disabled={busy} />
              <ExportButton rows={exportRows} filename="تصدير-العقارات" format="csv" disabled={busy} />
              <TargetedPdfButton
                label="طباعة / PDF"
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: dir === 'ltr' ? 'Properties' : 'العقارات',
                    subtitle: dir === 'ltr' ? 'Active properties list' : 'قائمة العقارات النشطة',
                    filename: 'properties',
                    metaLines: [
                      `${dir === 'ltr' ? 'Date' : 'التاريخ'}: ${new Date().toISOString().slice(0, 10)}`,
                      `${dir === 'ltr' ? 'Rows' : 'عدد الصفوف'}: ${exportRows.length}`,
                    ],
                    rows: exportRows,
                    dir,
                  })
                }
              />
              <Link to="/properties/new">
                <Button variant="gold">إضافة عقار</Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>بحث</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم/النوع/رقم الصك..." />
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                الإجمالي: <span className="font-bold text-slate-900">{filtered.length}</span>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</div>
          ) : null}

          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-right text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">الاسم</th>
                    <th className="px-4 py-3">التصنيف</th>
                    <th className="px-4 py-3">النوع</th>
                    <th className="px-4 py-3">رقم الصك</th>
                    <th className="px-4 py-3">الخريطة</th>
                    <th className="px-4 py-3">السعة</th>
                    <th className="px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {busy ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-12 animate-pulse rounded bg-slate-100" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-8 w-20 animate-pulse rounded bg-slate-100" />
                        </td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6">
                        <EmptyState
                          icon="🏢"
                          title={items.length === 0 ? 'لا توجد عقارات بعد' : 'لا توجد عقارات مطابقة'}
                          description={
                            items.length === 0
                              ? 'ابدأ بإضافة عقار لتعريف الوحدات والعقود لاحقاً.'
                              : 'جرّب تعديل البحث أو امسح الحقل لعرض كل العقارات.'
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filtered.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          <Link to={`/properties/${p.id}`} className="hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                            {p.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{typeLabel(p.type)}</td>
                        <td className="px-4 py-3 text-slate-700">{p.deed_number || '-'}</td>
                        <td className="px-4 py-3">
                          {p.maps_link ? (
                            <a href={p.maps_link} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">
                              فتح الرابط
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{p.total_units_capacity}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link to={`/properties/${p.id}`}>
                              <Button variant="subtle" size="sm" type="button">
                                تعديل
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={deletingId === p.id}
                              disabled={deletingId !== null && deletingId !== p.id}
                              onClick={() => onSoftDelete(p.id)}
                            >
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
    </div>
  )
}

