import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AdvancedFilterBar } from '../../components/AdvancedFilterBar'
import { ExportButton } from '../../components/ExportButton'
import { TargetedPdfButton } from '../../components/TargetedPdfButton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Label } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getActiveProperties } from '../../lib/db/properties'
import { getUnitsInventory, updateUnit } from '../../lib/db/units'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { exportReportPdf } from '../../lib/print/targetedPdf'

const UNIT_TYPES = ['Residential', 'Commercial', 'Mixed']
const UNIT_STATUSES = ['شاغرة', 'مؤجرة', 'تحت الصيانة', 'غير متاحة']

function typeLabel(t) {
  if (t === 'Residential') return 'سكني'
  if (t === 'Commercial') return 'تجاري'
  if (t === 'Mixed') return 'مختلط'
  return t || ''
}

const TABS = [
  { key: 'all', label: 'الكل' },
  { key: 'شاغرة', label: 'الشواغر' },
  { key: 'مؤجرة', label: 'المؤجرة' },
  { key: 'تحت الصيانة', label: 'تحت الصيانة' },
  { key: 'غير متاحة', label: 'غير متاحة' },
]

function statusBadge(status) {
  if (status === 'شاغرة') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'مؤجرة') return 'bg-red-50 text-red-700 ring-red-200'
  if (status === 'تحت الصيانة') return 'bg-amber-50 text-amber-800 ring-amber-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

export default function UnitsInventory() {
  const { i18n } = useTranslation()
  const { push: toastPush } = useToastDispatch()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('all')

  const [properties, setProperties] = useState([])
  const [refsBusy, setRefsBusy] = useState(true)
  const [filterPropertyId, setFilterPropertyId] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [advStatus, setAdvStatus] = useState('')
  const [roomsMin, setRoomsMin] = useState('')
  const [roomsMax, setRoomsMax] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('Residential')
  const [editRent, setEditRent] = useState('')
  const [editRooms, setEditRooms] = useState('1')
  const [editStatus, setEditStatus] = useState('شاغرة')
  const [editElec, setEditElec] = useState('')
  const [editWater, setEditWater] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  async function refresh() {
    setBusy(true)
    try {
      const data = await getUnitsInventory()
      setItems(data)
    } catch (e) {
      reportLoadFailure(toastPush, e, 'تعذر تحميل الوحدات', true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    refresh()
    ;(async () => {
      setRefsBusy(true)
      try {
        const p = await getActiveProperties()
        if (!cancelled) setProperties(p)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure(toastPush, e, 'تعذر تحميل العقارات', true)
        }
      } finally {
        if (!cancelled) setRefsBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const categoryOptions = useMemo(() => {
    const s = new Set()
    for (const u of items) {
      const c = String(u.property_category || '').trim()
      if (c) s.add(c)
    }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((u) => {
      if (advStatus) {
        if (u.status !== advStatus) return false
      } else if (tab !== 'all' && u.status !== tab) {
        return false
      }
      if (filterPropertyId && String(u.property_id || '') !== filterPropertyId) return false
      if (filterCategory && String(u.property_category || '') !== filterCategory) return false
      if (roomsMin !== '' && Number(u.rooms_count) < Number(roomsMin)) return false
      if (roomsMax !== '' && Number(u.rooms_count) > Number(roomsMax)) return false
      if (!needle) return true
      const hay = `${u.unit_name || ''} ${u.property_name || ''} ${u.property_category || ''} ${u.status || ''} ${u.electricity_meter_ref || ''} ${u.water_meter_ref || ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q, tab, advStatus, filterPropertyId, filterCategory, roomsMin, roomsMax])

  const exportRows = useMemo(() => {
    return filtered.map((u) => ({
      العقار: u.property_name || '',
      'تصنيف العقار': u.property_category || '',
      الوحدة: u.unit_name || '',
      'عدد الغرف': u.rooms_count ?? '',
      الحالة: u.status || '',
      'القيمة المستهدفة': u.target_rent_value,
      'رقم عداد الكهرباء': u.electricity_meter_ref || '',
      'رقم عداد المياه': u.water_meter_ref || '',
    }))
  }, [filtered])
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'

  function openUnitEdit(u) {
    setEditRow(u)
    setEditName(u.unit_name || '')
    setEditType(u.type || 'Residential')
    setEditRent(String(u.target_rent_value ?? ''))
    setEditRooms(String(u.rooms_count ?? '1'))
    setEditStatus(u.status || 'شاغرة')
    setEditElec(u.electricity_meter_ref != null ? String(u.electricity_meter_ref) : '')
    setEditWater(u.water_meter_ref != null ? String(u.water_meter_ref) : '')
    setEditOpen(true)
  }

  async function onSaveUnitEdit(e) {
    e.preventDefault()
    if (!editRow?.id) return
    const rent = Number(editRent)
    const rooms = Number(editRooms)
    if (!editName.trim()) {
      toastPush({ type: 'error', title: 'تحقق من المدخلات', message: 'اسم الوحدة إلزامي.' })
      return
    }
    if (!Number.isFinite(rent) || rent < 0) {
      toastPush({ type: 'error', title: 'تحقق من المدخلات', message: 'القيمة الإيجارية يجب أن تكون رقمًا صحيحًا.' })
      return
    }
    if (!Number.isFinite(rooms) || rooms < 1) {
      toastPush({ type: 'error', title: 'تحقق من المدخلات', message: 'عدد الغرف يجب أن يكون 1 على الأقل.' })
      return
    }
    setEditSaving(true)
    try {
      const updated = await updateUnit(editRow.id, {
        unit_name: editName.trim(),
        type: editType,
        target_rent_value: rent,
        rooms_count: rooms,
        status: editStatus,
        electricity_meter_ref: editElec,
        water_meter_ref: editWater,
      })
      setItems((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated, property_name: x.property_name, property_category: x.property_category } : x)))
      toastPush({ type: 'success', title: 'تم التحديث', message: 'تم تحديث بيانات الوحدة.' })
      setEditOpen(false)
      setEditRow(null)
    } catch (err) {
      reportLoadFailure(toastPush, err, 'فشل التحديث', true)
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>قائمة الوحدات الشاملة</CardTitle>
              <CardDescription>عرض بانورامي للوحدات عبر جميع العقارات مع فلاتر حسب الحالة</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={exportRows} filename="تصدير-قائمة-الوحدات" disabled={busy} />
              <TargetedPdfButton
                label="طباعة / PDF"
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: dir === 'ltr' ? 'Master unit register' : 'قائمة الوحدات الشاملة',
                    subtitle: dir === 'ltr' ? 'Units inventory export' : 'تصدير قائمة الوحدات',
                    filename: 'units-inventory',
                    metaLines: [
                      `${dir === 'ltr' ? 'Date' : 'التاريخ'}: ${new Date().toISOString().slice(0, 10)}`,
                      `${dir === 'ltr' ? 'Rows' : 'عدد الصفوف'}: ${exportRows.length}`,
                    ],
                    rows: exportRows,
                    dir,
                  })
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Button
                key={t.key}
                variant={tab === t.key ? 'gold' : 'subtle'}
                size="sm"
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          <AdvancedFilterBar>
            <div>
              <Label>العقار</Label>
              <Select value={filterPropertyId} onChange={(e) => setFilterPropertyId(e.target.value)} disabled={refsBusy}>
                <option value="">كل العقارات</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>تصنيف العقار</Label>
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="">كل التصنيفات</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>حالة الوحدة (متقدم)</Label>
              <Select value={advStatus} onChange={(e) => setAdvStatus(e.target.value)}>
                <option value="">اتبع التبويب أعلاه</option>
                <option value="شاغرة">شاغرة</option>
                <option value="مؤجرة">مؤجرة</option>
                <option value="تحت الصيانة">تحت الصيانة</option>
                <option value="غير متاحة">غير متاحة</option>
              </Select>
            </div>
            <div>
              <Label>عدد الغرف من</Label>
              <Input inputMode="numeric" value={roomsMin} onChange={(e) => setRoomsMin(e.target.value)} placeholder="مثال: 1" />
            </div>
            <div>
              <Label>عدد الغرف إلى</Label>
              <Input inputMode="numeric" value={roomsMax} onChange={(e) => setRoomsMax(e.target.value)} placeholder="مثال: 5" />
            </div>
          </AdvancedFilterBar>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>بحث</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الوحدة/اسم العقار/الحالة..." />
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
                    <th className="px-4 py-3">العقار</th>
                    <th className="px-4 py-3">تصنيف العقار</th>
                    <th className="px-4 py-3">الوحدة</th>
                    <th className="px-4 py-3">عدد الغرف</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-4 py-3">القيمة المستهدفة</th>
                    <th className="px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {busy ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-full max-w-[12rem] animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        لا توجد وحدات مطابقة.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">{u.property_name}</td>
                        <td className="px-4 py-3 text-slate-700">{u.property_category || '-'}</td>
                        <td className="px-4 py-3 text-slate-800">{u.unit_name}</td>
                        <td className="px-4 py-3 text-slate-700">{u.rooms_count ?? '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusBadge(u.status)}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{u.target_rent_value}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="subtle" size="sm" onClick={() => openUnitEdit(u)}>
                              تعديل
                            </Button>
                            <Link to={`/properties/${u.property_id}`}>
                              <Button type="button" variant="ghost" size="sm">
                                العقار
                              </Button>
                            </Link>
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

      <Modal open={editOpen} onClose={() => (editSaving ? null : setEditOpen(false))} title="تعديل وحدة">
        <form onSubmit={onSaveUnitEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 text-xs text-slate-500">
            {editRow ? (
              <>
                العقار: <span className="font-semibold text-slate-800">{editRow.property_name}</span>
              </>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label>اسم الوحدة</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label>نوع الوحدة</Label>
            <Select value={editType} onChange={(e) => setEditType(e.target.value)} className="mt-1">
              {UNIT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>القيمة المستهدفة</Label>
            <Input value={editRent} onChange={(e) => setEditRent(e.target.value)} type="number" min={0} step="0.01" required className="mt-1" />
          </div>
          <div>
            <Label>عدد الغرف</Label>
            <Input value={editRooms} onChange={(e) => setEditRooms(e.target.value)} type="number" min={1} step={1} required className="mt-1" />
          </div>
          <div>
            <Label>الحالة</Label>
            <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="mt-1">
              {UNIT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>رقم حساب/عداد الكهرباء (اختياري)</Label>
            <Input value={editElec} onChange={(e) => setEditElec(e.target.value)} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label>رقم حساب/عداد المياه (اختياري)</Label>
            <Input value={editWater} onChange={(e) => setEditWater(e.target.value)} className="mt-1" />
          </div>
          <div className="sm:col-span-2 flex gap-2 pt-2">
            <Button variant="gold" type="submit" className="flex-1" disabled={editSaving}>
              {editSaving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
            <Button variant="subtle" type="button" className="flex-1" onClick={() => setEditOpen(false)} disabled={editSaving}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

