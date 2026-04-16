import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExportButton } from '../../components/ExportButton'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { Combobox } from '../../components/ui/Combobox'
import { createOwner, getOwners } from '../../lib/db/owners'
import { getPropertyById, updateProperty } from '../../lib/db/properties'
import { bulkCreateUnits, getActiveUnitsByPropertyId, softDeleteUnit, updateUnit } from '../../lib/db/units'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'

const TYPES = ['Residential', 'Commercial', 'Mixed']
const UNIT_STATUSES = ['شاغرة', 'مؤجرة', 'تحت الصيانة', 'غير متاحة']

function typeLabel(t) {
  if (t === 'Residential') return 'سكني'
  if (t === 'Commercial') return 'تجاري'
  if (t === 'Mixed') return 'مختلط'
  return t
}

export default function PropertyDetail() {
  const { id } = useParams()
  const { push } = useToastDispatch()
  const toastPush = useCallback((payload) => push(payload), [push])

  const [property, setProperty] = useState(null)
  const [units, setUnits] = useState([])
  const [busy, setBusy] = useState(true)
  const [unitsBusy, setUnitsBusy] = useState(true)

  const [showBulk, setShowBulk] = useState(false)
  const [baseName, setBaseName] = useState('')
  const [unitType, setUnitType] = useState('Residential')
  const [targetRent, setTargetRent] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [roomsCount, setRoomsCount] = useState('1')
  const [unitStatus, setUnitStatus] = useState('شاغرة')
  const [saving, setSaving] = useState(false)

  const [showEditProperty, setShowEditProperty] = useState(false)
  const [propName, setPropName] = useState('')
  const [propType, setPropType] = useState('Residential')
  const [propDeed, setPropDeed] = useState('')
  const [propMaps, setPropMaps] = useState('')
  const [propCap, setPropCap] = useState('')
  const [propCategory, setPropCategory] = useState('')
  const [propOwnerCrmId, setPropOwnerCrmId] = useState('')
  const [propMgmtDate, setPropMgmtDate] = useState('')
  const [propElecMeters, setPropElecMeters] = useState('0')
  const [propWaterMeters, setPropWaterMeters] = useState('0')
  const [propSaving, setPropSaving] = useState(false)

  const [owners, setOwners] = useState([])
  const [ownersBusy, setOwnersBusy] = useState(true)
  const [showOwnerQuick, setShowOwnerQuick] = useState(false)
  const [quickOwnerName, setQuickOwnerName] = useState('')
  const [quickNational, setQuickNational] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [ownerQuickSaving, setOwnerQuickSaving] = useState(false)

  const [editingUnit, setEditingUnit] = useState(null)
  const [editUnitName, setEditUnitName] = useState('')
  const [editUnitType, setEditUnitType] = useState('Residential')
  const [editUnitRent, setEditUnitRent] = useState('')
  const [editRoomsCount, setEditRoomsCount] = useState('1')
  const [editUnitStatus, setEditUnitStatus] = useState('شاغرة')
  const [editElecMeterRef, setEditElecMeterRef] = useState('')
  const [editWaterMeterRef, setEditWaterMeterRef] = useState('')
  const [unitSaving, setUnitSaving] = useState(false)

  const title = useMemo(() => 'تفاصيل العقار', [])

  const ownerLabel = useMemo(() => {
    if (!propOwnerCrmId) return ''
    const o = owners.find((x) => x.id === propOwnerCrmId)
    return o ? `${o.full_name} — ${o.national_id}` : propOwnerCrmId
  }, [owners, propOwnerCrmId])

  const ownerOptions = useMemo(() => {
    return (owners || []).map((o) => ({
      value: o.id,
      label: `${o.full_name || 'مالك'} — ${o.national_id || ''}`,
    }))
  }, [owners])

  const unitExportRows = useMemo(() => {
    return (units || []).map((u) => ({
      'اسم الوحدة': u.unit_name,
      النوع: typeLabel(u.type),
      'عدد الغرف': u.rooms_count ?? '',
      الحالة: u.status,
      'القيمة المستهدفة': u.target_rent_value,
      'رقم عداد الكهرباء': u.electricity_meter_ref || '',
      'رقم عداد المياه': u.water_meter_ref || '',
    }))
  }, [units])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setBusy(true)
        const p = await getPropertyById(id)
        if (cancelled) return
        setProperty(p)
        setPropName(p.name || '')
        setPropCategory(p.category || '')
        setPropType(p.type || 'Residential')
        setPropDeed(p.deed_number || '')
        setPropMaps(p.maps_link || '')
        setPropCap(String(p.total_units_capacity ?? ''))
        setPropElecMeters(String(p.electricity_meter_count ?? 0))
        setPropWaterMeters(String(p.water_meter_count ?? 0))
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure(toastPush, e, 'تعذر تحميل العقار', true)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, toastPush])

  useEffect(() => {
    if (!property?.id) return
    setPropOwnerCrmId(String(property.owner_crm_id || ''))
    setPropMgmtDate(property.management_start_date ? String(property.management_start_date).slice(0, 10) : '')
  }, [property?.id, property?.owner_crm_id, property?.management_start_date])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setOwnersBusy(true)
      try {
        const list = await getOwners()
        if (!cancelled) setOwners(list)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure(toastPush, e, 'تعذر تحميل الملاك', true)
        }
      } finally {
        if (!cancelled) setOwnersBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toastPush])

  async function onQuickCreateOwner(e) {
    e.preventDefault()
    const nm = String(quickOwnerName || '').trim()
    const nat = String(quickNational || '').trim()
    const ph = String(quickPhone || '').trim()
    if (!nm || !nat || !ph) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'يرجى تعبئة الاسم والهوية والجوال.' })
      return
    }
    setOwnerQuickSaving(true)
    try {
      const created = await createOwner({ full_name: nm, national_id: nat, phone: ph })
      setOwners((prev) => [...prev, created].sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))))
      setPropOwnerCrmId(created.id)
      setShowOwnerQuick(false)
      setQuickOwnerName('')
      setQuickNational('')
      setQuickPhone('')
      push({ type: 'success', title: 'تمت الإضافة', message: 'تم إضافة المالك إلى CRM.' })
    } catch (e) {
      reportLoadFailure(toastPush, e, 'فشل إضافة المالك', true)
    } finally {
      setOwnerQuickSaving(false)
    }
  }

  async function refreshUnits() {
    try {
      setUnitsBusy(true)
      const list = await getActiveUnitsByPropertyId(id)
      setUnits(list)
    } catch (e) {
      reportLoadFailure(toastPush, e, 'تعذر تحميل الوحدات', true)
    } finally {
      setUnitsBusy(false)
    }
  }

  useEffect(() => {
    refreshUnits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function onBulkCreate(e) {
    e.preventDefault()

    const q = Number(quantity)
    const rent = Number(targetRent)
    const rooms = Number(roomsCount)
    if (!baseName.trim()) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'اسم الوحدة إلزامي.' })
      return
    }
    if (!Number.isFinite(rent) || rent < 0) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'القيمة الإيجارية المستهدفة يجب أن تكون رقمًا صحيحًا.' })
      return
    }
    if (!Number.isFinite(rooms) || rooms < 1) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'عدد الغرف يجب أن يكون رقمًا صحيحًا (1 على الأقل).' })
      return
    }
    if (!Number.isFinite(q) || q <= 0 || q > 500) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'العدد يجب أن يكون بين 1 و 500.' })
      return
    }

    const payload = Array.from({ length: q }).map((_, i) => ({
      property_id: id,
      unit_name: `${baseName.trim()} ${i + 1}`,
      type: unitType,
      target_rent_value: rent,
      rooms_count: rooms,
      status: unitStatus,
    }))

    setSaving(true)
    try {
      const inserted = await bulkCreateUnits(payload)
      push({
        type: 'success',
        title: 'تم إنشاء الوحدات',
        message: `تم إنشاء ${inserted.length} وحدة بنجاح.`,
      })
      setShowBulk(false)
      setBaseName('')
      setTargetRent('')
      setQuantity('1')
      setRoomsCount('1')
      setUnitStatus('شاغرة')
      await refreshUnits()
    } catch (e2) {
      reportLoadFailure(toastPush, e2, 'فشل إنشاء الوحدات', true)
    } finally {
      setSaving(false)
    }
  }

  async function onUnitDelete(unitId) {
    const ok = window.confirm('هل تريد إخفاء هذه الوحدة؟')
    if (!ok) return
    try {
      await softDeleteUnit(unitId)
      push({ type: 'success', title: 'تم الإخفاء', message: 'تم إخفاء الوحدة بنجاح.' })
      setUnits((prev) => prev.filter((u) => u.id !== unitId))
    } catch (e) {
      reportLoadFailure(toastPush, e, 'فشل الإخفاء', true)
    }
  }

  async function onUpdateProperty(e) {
    e.preventDefault()

    const cap = Number(propCap)
    const em = Number(propElecMeters)
    const wm = Number(propWaterMeters)
    if (!Number.isFinite(cap) || cap < 0) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'السعة الإجمالية يجب أن تكون رقمًا صحيحًا.' })
      return
    }
    if (!Number.isFinite(em) || em < 0 || !Number.isFinite(wm) || wm < 0) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'عدد العدادات يجب أن يكون رقمًا صحيحًا (0 أو أكثر).' })
      return
    }
    if (!propCategory.trim()) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'تصنيف العقار إلزامي.' })
      return
    }

    setPropSaving(true)
    try {
      const updated = await updateProperty(id, {
        name: propName,
        category: propCategory,
        type: propType,
        deed_number: propDeed,
        maps_link: propMaps,
        total_units_capacity: cap,
        electricity_meter_count: em,
        water_meter_count: wm,
        owner_crm_id: String(propOwnerCrmId || '').trim() || null,
        management_start_date: propMgmtDate || null,
      })
      setProperty(updated)
      setPropOwnerCrmId(String(updated.owner_crm_id || ''))
      setPropMgmtDate(updated.management_start_date ? String(updated.management_start_date).slice(0, 10) : '')
      push({ type: 'success', title: 'تم التحديث', message: 'تم تحديث بيانات العقار بنجاح.' })
      setShowEditProperty(false)
    } catch (e) {
      reportLoadFailure(toastPush, e, 'فشل التحديث', true)
    } finally {
      setPropSaving(false)
    }
  }

  function openEditUnit(u) {
    setEditingUnit(u)
    setEditUnitName(u.unit_name || '')
    setEditUnitType(u.type || 'Residential')
    setEditUnitRent(String(u.target_rent_value ?? ''))
    setEditRoomsCount(String(u.rooms_count ?? '1'))
    setEditUnitStatus(u.status || 'شاغرة')
    setEditElecMeterRef(u.electricity_meter_ref != null ? String(u.electricity_meter_ref) : '')
    setEditWaterMeterRef(u.water_meter_ref != null ? String(u.water_meter_ref) : '')
  }

  async function onUpdateUnit(e) {
    e.preventDefault()

    const rent = Number(editUnitRent)
    const rooms = Number(editRoomsCount)
    if (!editingUnit?.id) return
    if (!editUnitName.trim()) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'اسم الوحدة إلزامي.' })
      return
    }
    if (!Number.isFinite(rent) || rent < 0) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'القيمة الإيجارية يجب أن تكون رقمًا صحيحًا.' })
      return
    }
    if (!Number.isFinite(rooms) || rooms < 1) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'عدد الغرف يجب أن يكون رقمًا صحيحًا (1 على الأقل).' })
      return
    }

    setUnitSaving(true)
    try {
      const updated = await updateUnit(editingUnit.id, {
        unit_name: editUnitName,
        type: editUnitType,
        target_rent_value: rent,
        rooms_count: rooms,
        status: editUnitStatus,
        electricity_meter_ref: editElecMeterRef,
        water_meter_ref: editWaterMeterRef,
      })
      setUnits((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      push({ type: 'success', title: 'تم التحديث', message: 'تم تحديث بيانات الوحدة بنجاح.' })
      setEditingUnit(null)
    } catch (e) {
      reportLoadFailure(toastPush, e, 'فشل التحديث', true)
    } finally {
      setUnitSaving(false)
    }
  }

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-extrabold text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-500">
            <Link to="/properties" className="font-semibold text-slate-900 hover:underline">
              العقارات
            </Link>{' '}
            / التفاصيل
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="gold" onClick={() => setShowBulk(true)}>
            إضافة وحدات (نسخ جماعي)
          </Button>
          <Button
            variant="subtle"
            onClick={() => {
              if (property) {
                setPropElecMeters(String(property.electricity_meter_count ?? 0))
                setPropWaterMeters(String(property.water_meter_count ?? 0))
              }
              setShowEditProperty(true)
            }}
          >
            تعديل
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>معلومات العقار</CardTitle>
          <CardDescription>البيانات الأساسية للعقار</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : property ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">الاسم</div>
                <div className="mt-1 font-extrabold text-slate-900">{property.name}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">التصنيف</div>
                <div className="mt-1 font-extrabold text-slate-900">{property.category}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">النوع</div>
                <div className="mt-1 font-extrabold text-slate-900">{typeLabel(property.type)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">السعة الإجمالية</div>
                <div className="mt-1 font-extrabold text-slate-900">{property.total_units_capacity}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">عدادات الكهرباء (عدد)</div>
                <div className="mt-1 font-extrabold text-slate-900">{property.electricity_meter_count ?? 0}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">عدادات المياه (عدد)</div>
                <div className="mt-1 font-extrabold text-slate-900">{property.water_meter_count ?? 0}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">رقم الصك</div>
                <div className="mt-1 font-semibold text-slate-900">{property.deed_number || '-'}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:col-span-2">
                <div className="text-xs font-bold text-slate-500">رابط الخريطة</div>
                <div className="mt-1">
                  {property.maps_link ? (
                    <a href={property.maps_link} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">
                      فتح الرابط
                    </a>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">مالك العقار (CRM)</div>
                <div className="mt-1 font-semibold text-slate-900">{ownerLabel || '-'}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">تاريخ بداية الإدارة</div>
                <div className="mt-1 font-semibold text-slate-900">{property.management_start_date || '-'}</div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              تعذر تحميل بيانات العقار أو العقار غير موجود.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>إدارة الوحدات</CardTitle>
              <CardDescription>إضافة/عرض/إخفاء الوحدات المرتبطة بهذا العقار</CardDescription>
            </div>
            <ExportButton rows={unitExportRows} filename={`وحدات-العقار-${id}`} disabled={unitsBusy} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-right text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">اسم الوحدة</th>
                    <th className="px-4 py-3">النوع</th>
                    <th className="px-4 py-3">عدد الغرف</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-4 py-3">القيمة الإيجارية المستهدفة</th>
                    <th className="px-4 py-3">عداد كهرباء</th>
                    <th className="px-4 py-3">عداد مياه</th>
                    <th className="px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {unitsBusy ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : units.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                        لا توجد وحدات بعد. استخدم "إضافة وحدات (نسخ جماعي)".
                      </td>
                    </tr>
                  ) : (
                    units.map((u) => (
                      <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">{u.unit_name}</td>
                        <td className="px-4 py-3 text-slate-700">{typeLabel(u.type)}</td>
                        <td className="px-4 py-3 text-slate-700">{u.rooms_count ?? '-'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={[
                              'inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1',
                              u.status === 'شاغرة'
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                : u.status === 'مؤجرة'
                                  ? 'bg-red-50 text-red-700 ring-red-200'
                                  : u.status === 'تحت الصيانة'
                                    ? 'bg-amber-50 text-amber-800 ring-amber-200'
                                    : 'bg-slate-100 text-slate-700 ring-slate-200',
                            ].join(' ')}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{u.target_rent_value}</td>
                        <td className="px-4 py-3 text-slate-600">{u.electricity_meter_ref || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{u.water_meter_ref || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button variant="subtle" size="sm" onClick={() => openEditUnit(u)}>
                              تعديل
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => onUnitDelete(u.id)}>
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

      {showBulk ? (
        <Modal open={showBulk} onClose={() => (saving ? null : setShowBulk(false))}>
          <CardHeader>
            <CardTitle>إضافة وحدات (نسخ جماعي)</CardTitle>
            <CardDescription>سيتم إنشاء وحدات متعددة في عملية واحدة</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onBulkCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>اسم الوحدة (إلزامي)</Label>
                <Input value={baseName} onChange={(e) => setBaseName(e.target.value)} placeholder="مثال: شقة" required />
              </div>
              <div>
                <Label>نوع الوحدة</Label>
                <Select value={unitType} onChange={(e) => setUnitType(e.target.value)} required>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel(t)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>القيمة الإيجارية المستهدفة (إلزامي)</Label>
                <Input value={targetRent} onChange={(e) => setTargetRent(e.target.value)} type="number" min={0} step="0.01" required />
              </div>
              <div>
                <Label>عدد الغرف (إلزامي)</Label>
                <Input value={roomsCount} onChange={(e) => setRoomsCount(e.target.value)} type="number" min={1} step={1} required />
              </div>
              <div className="sm:col-span-2">
                <Label>حالة الوحدة</Label>
                <Select value={unitStatus} onChange={(e) => setUnitStatus(e.target.value)} required>
                  {UNIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>العدد (إلزامي)</Label>
                <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min={1} step={1} required />
                <div className="mt-2 text-xs text-slate-500">مثال: "شقة" + العدد 5 → (شقة 1، شقة 2، ... شقة 5)</div>
              </div>

              <div className="sm:col-span-2 flex gap-3 pt-2">
                <Button variant="gold" className="flex-1" type="submit" disabled={saving}>
                  {saving ? 'جاري الإنشاء...' : 'حفظ'}
                </Button>
                <Button variant="subtle" className="flex-1" type="button" onClick={() => setShowBulk(false)} disabled={saving}>
                  إلغاء
                </Button>
              </div>
            </form>
          </CardContent>
        </Modal>
      ) : null}

      <Modal open={showEditProperty} onClose={() => (propSaving ? null : setShowEditProperty(false))}>
        <CardHeader>
          <CardTitle>تعديل بيانات العقار</CardTitle>
          <CardDescription>تحديث البيانات الأساسية للعقار</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onUpdateProperty} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>اسم العقار (إلزامي)</Label>
              <Input value={propName} onChange={(e) => setPropName(e.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <Label>تصنيف العقار (إلزامي)</Label>
              <Input value={propCategory} onChange={(e) => setPropCategory(e.target.value)} required />
            </div>
            <div>
              <Label>نوع العقار</Label>
              <Select value={propType} onChange={(e) => setPropType(e.target.value)} required>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>السعة الإجمالية للوحدات (إلزامي)</Label>
              <Input value={propCap} onChange={(e) => setPropCap(e.target.value)} type="number" min={0} step={1} required />
            </div>
            <div>
              <Label>عدادات الكهرباء — العدد</Label>
              <Input value={propElecMeters} onChange={(e) => setPropElecMeters(e.target.value)} type="number" min={0} step={1} required />
            </div>
            <div>
              <Label>عدادات المياه — العدد</Label>
              <Input value={propWaterMeters} onChange={(e) => setPropWaterMeters(e.target.value)} type="number" min={0} step={1} required />
            </div>
            <div>
              <Label>رقم الصك (اختياري)</Label>
              <Input value={propDeed} onChange={(e) => setPropDeed(e.target.value)} />
            </div>
            <div>
              <Label>رابط الخريطة (اختياري)</Label>
              <Input value={propMaps} onChange={(e) => setPropMaps(e.target.value)} type="url" placeholder="https://..." />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <Label className="mb-0">مالك العقار (CRM) — اختياري</Label>
                <Button type="button" variant="subtle" size="sm" onClick={() => setShowOwnerQuick(true)} disabled={ownersBusy}>
                  إضافة مالك سريع
                </Button>
              </div>
              <Combobox
                label=""
                value={propOwnerCrmId}
                onChange={(v) => setPropOwnerCrmId(String(v || ''))}
                options={ownerOptions}
                placeholder="ابحث بالاسم أو رقم الهوية..."
              />
            </div>
            <div>
              <Label>تاريخ بداية الإدارة (اختياري)</Label>
              <Input value={propMgmtDate} onChange={(e) => setPropMgmtDate(e.target.value)} type="date" />
            </div>
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <Button variant="gold" className="flex-1" type="submit" disabled={propSaving}>
                {propSaving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
              <Button variant="subtle" className="flex-1" type="button" onClick={() => setShowEditProperty(false)} disabled={propSaving}>
                إلغاء
              </Button>
            </div>
          </form>
        </CardContent>
      </Modal>

      <Modal open={showOwnerQuick} onClose={() => (ownerQuickSaving ? null : setShowOwnerQuick(false))}>
        <CardHeader>
          <CardTitle>إضافة مالك (CRM)</CardTitle>
          <CardDescription>سيتم اختياره تلقائيًا لربطه بهذا العقار بعد الحفظ من نموذج التعديل</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onQuickCreateOwner} className="grid grid-cols-1 gap-3">
            <div>
              <Label>الاسم الكامل</Label>
              <Input value={quickOwnerName} onChange={(e) => setQuickOwnerName(e.target.value)} required />
            </div>
            <div>
              <Label>رقم الهوية / السجل</Label>
              <Input value={quickNational} onChange={(e) => setQuickNational(e.target.value)} required />
            </div>
            <div>
              <Label>رقم الجوال</Label>
              <Input value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} required />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="gold" className="flex-1" type="submit" disabled={ownerQuickSaving}>
                {ownerQuickSaving ? 'جاري الحفظ...' : 'حفظ المالك'}
              </Button>
              <Button variant="subtle" className="flex-1" type="button" onClick={() => setShowOwnerQuick(false)} disabled={ownerQuickSaving}>
                إلغاء
              </Button>
            </div>
          </form>
        </CardContent>
      </Modal>

      <Modal open={Boolean(editingUnit)} onClose={() => (unitSaving ? null : setEditingUnit(null))}>
        <CardHeader>
          <CardTitle>تعديل بيانات الوحدة</CardTitle>
          <CardDescription>تحديث اسم الوحدة/نوعها/القيمة الإيجارية</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onUpdateUnit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>اسم الوحدة (إلزامي)</Label>
              <Input value={editUnitName} onChange={(e) => setEditUnitName(e.target.value)} required />
            </div>
            <div>
              <Label>نوع الوحدة</Label>
              <Select value={editUnitType} onChange={(e) => setEditUnitType(e.target.value)} required>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>القيمة الإيجارية المستهدفة (إلزامي)</Label>
              <Input value={editUnitRent} onChange={(e) => setEditUnitRent(e.target.value)} type="number" min={0} step="0.01" required />
            </div>
            <div>
              <Label>عدد الغرف</Label>
              <Input value={editRoomsCount} onChange={(e) => setEditRoomsCount(e.target.value)} type="number" min={1} step={1} required />
            </div>
            <div>
              <Label>حالة الوحدة</Label>
              <Select value={editUnitStatus} onChange={(e) => setEditUnitStatus(e.target.value)} required>
                {UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>رقم حساب/عداد الكهرباء (اختياري)</Label>
              <Input value={editElecMeterRef} onChange={(e) => setEditElecMeterRef(e.target.value)} placeholder="مثال: رقم الحساب في سداد / العداد" />
            </div>
            <div className="sm:col-span-2">
              <Label>رقم حساب/عداد المياه (اختياري)</Label>
              <Input value={editWaterMeterRef} onChange={(e) => setEditWaterMeterRef(e.target.value)} placeholder="مثال: رقم الحساب في سداد / العداد" />
            </div>
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <Button variant="gold" className="flex-1" type="submit" disabled={unitSaving}>
                {unitSaving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
              <Button variant="subtle" className="flex-1" type="button" onClick={() => setEditingUnit(null)} disabled={unitSaving}>
                إلغاء
              </Button>
            </div>
          </form>
        </CardContent>
      </Modal>
    </div>
  )
}

