import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { translatePropertyCategory, translatePropertyType, translateUnitStatus } from '../../lib/i18n/domainLabels'
import { naturalCompare } from '../../lib/sort/naturalCompare'
import { ManagerBadge } from '../../components/ManagerBadge'

const TYPES = ['Residential', 'Commercial', 'Mixed']
const UNIT_STATUSES = ['شاغرة', 'مؤجرة', 'تحت الصيانة', 'غير متاحة']

export default function PropertyDetail() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
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
  const [propAssignedManager, setPropAssignedManager] = useState('')
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

  const title = t('propertyDetail.title')

  const ownerLabel = useMemo(() => {
    if (!propOwnerCrmId) return ''
    const o = owners.find((x) => x.id === propOwnerCrmId)
    return o ? `${o.full_name} — ${o.national_id}` : propOwnerCrmId
  }, [owners, propOwnerCrmId])

  const ownerOptions = useMemo(() => {
    return (owners || []).map((o) => ({
      value: o.id,
      label: `${o.full_name || t('propertyCreate.ownerFallback', 'Owner')} — ${o.national_id || ''}`,
    }))
  }, [owners, t])

  const unitExportRows = useMemo(() => {
    return (units || []).map((u) => ({
      [t('propertyDetail.unitsColName')]: u.unit_name,
      [t('propertyDetail.unitsColType')]: translatePropertyType(u.type, lang),
      [t('propertyDetail.unitsColRooms')]: u.rooms_count ?? '',
      [t('propertyDetail.unitsColStatus')]: translateUnitStatus(u.status, lang),
      [t('propertyDetail.unitsColTargetRent')]: u.target_rent_value,
      [t('propertyDetail.unitsColElecMeter')]: u.electricity_meter_ref || '',
      [t('propertyDetail.unitsColWaterMeter')]: u.water_meter_ref || '',
    }))
  }, [units, t, lang])

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
          reportLoadFailure(toastPush, e, t('propertyDetail.loadFail'), true)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, toastPush, t])

  useEffect(() => {
    if (!property?.id) return
    setPropOwnerCrmId(String(property.owner_crm_id || ''))
    setPropMgmtDate(property.management_start_date ? String(property.management_start_date).slice(0, 10) : '')
    setPropAssignedManager(String(property.assigned_manager || ''))
  }, [property?.id, property?.owner_crm_id, property?.management_start_date, property?.assigned_manager])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setOwnersBusy(true)
      try {
        const list = await getOwners()
        if (!cancelled) setOwners(list)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure(toastPush, e, t('propertyDetail.loadOwnersFail'), true)
        }
      } finally {
        if (!cancelled) setOwnersBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toastPush, t])

  async function onQuickCreateOwner(e) {
    e.preventDefault()
    const nm = String(quickOwnerName || '').trim()
    const nat = String(quickNational || '').trim()
    const ph = String(quickPhone || '').trim()
    if (!nm || !nat || !ph) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.invalidOwnerMsg') })
      return
    }
    setOwnerQuickSaving(true)
    try {
      const created = await createOwner({ full_name: nm, national_id: nat, phone: ph })
      setOwners((prev) => [...prev, created].sort((a, b) => naturalCompare(a.full_name, b.full_name)))
      setPropOwnerCrmId(created.id)
      setShowOwnerQuick(false)
      setQuickOwnerName('')
      setQuickNational('')
      setQuickPhone('')
      push({ type: 'success', title: t('propertyDetail.ownerAdded'), message: t('propertyDetail.ownerAddedMsg') })
    } catch (e) {
      reportLoadFailure(toastPush, e, t('propertyDetail.ownerAddFail'), true)
    } finally {
      setOwnerQuickSaving(false)
    }
  }

  const refreshUnits = useCallback(async () => {
    try {
      setUnitsBusy(true)
      const list = await getActiveUnitsByPropertyId(id)
      setUnits(list)
    } catch (e) {
      reportLoadFailure(toastPush, e, t('propertyDetail.loadUnitsFail'), true)
    } finally {
      setUnitsBusy(false)
    }
  }, [id, toastPush, t])

  useEffect(() => {
    refreshUnits()
  }, [refreshUnits])

  async function onBulkCreate(e) {
    e.preventDefault()

    const q = Number(quantity)
    const rent = Number(targetRent)
    const rooms = Number(roomsCount)
    if (!baseName.trim()) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.bulkInvalidName') })
      return
    }
    if (!Number.isFinite(rent) || rent < 0) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.bulkInvalidRent') })
      return
    }
    if (!Number.isFinite(rooms) || rooms < 1) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.bulkInvalidRooms') })
      return
    }
    if (!Number.isFinite(q) || q <= 0 || q > 500) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.bulkInvalidQty') })
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
        title: t('propertyDetail.bulkCreated'),
        message: t('propertyDetail.bulkCreatedMsg', { count: inserted.length }),
      })
      setShowBulk(false)
      setBaseName('')
      setTargetRent('')
      setQuantity('1')
      setRoomsCount('1')
      setUnitStatus('شاغرة')
      await refreshUnits()
    } catch (e2) {
      reportLoadFailure(toastPush, e2, t('propertyDetail.bulkFail'), true)
    } finally {
      setSaving(false)
    }
  }

  async function onUnitDelete(unitId) {
    const ok = window.confirm(t('propertyDetail.confirmHide'))
    if (!ok) return
    try {
      await softDeleteUnit(unitId)
      push({ type: 'success', title: t('propertyDetail.unitHidden'), message: t('propertyDetail.unitHiddenMsg') })
      setUnits((prev) => prev.filter((u) => u.id !== unitId))
    } catch (e) {
      reportLoadFailure(toastPush, e, t('propertyDetail.unitHideFail'), true)
    }
  }

  async function onUpdateProperty(e) {
    e.preventDefault()

    const cap = Number(propCap)
    const em = Number(propElecMeters)
    const wm = Number(propWaterMeters)
    if (!Number.isFinite(cap) || cap < 0) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.capacityInvalid') })
      return
    }
    if (!Number.isFinite(em) || em < 0 || !Number.isFinite(wm) || wm < 0) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.metersInvalid') })
      return
    }
    if (!propCategory.trim()) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.categoryRequired') })
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
        assigned_manager: propAssignedManager,
      })
      setProperty(updated)
      setPropOwnerCrmId(String(updated.owner_crm_id || ''))
      setPropMgmtDate(updated.management_start_date ? String(updated.management_start_date).slice(0, 10) : '')
      setPropAssignedManager(String(updated.assigned_manager || ''))
      push({ type: 'success', title: t('propertyDetail.propertyUpdated'), message: t('propertyDetail.propertyUpdatedMsg') })
      setShowEditProperty(false)
    } catch (e) {
      reportLoadFailure(toastPush, e, t('propertyDetail.propertyUpdateFail'), true)
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
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.bulkInvalidName') })
      return
    }
    if (!Number.isFinite(rent) || rent < 0) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.bulkInvalidRent') })
      return
    }
    if (!Number.isFinite(rooms) || rooms < 1) {
      push({ type: 'error', title: t('propertyDetail.invalidInputTitle'), message: t('propertyDetail.bulkInvalidRooms') })
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
      push({ type: 'success', title: t('propertyDetail.unitUpdated'), message: t('propertyDetail.unitUpdatedMsg') })
      setEditingUnit(null)
    } catch (e) {
      reportLoadFailure(toastPush, e, t('propertyDetail.unitUpdateFail'), true)
    } finally {
      setUnitSaving(false)
    }
  }

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="text-lg font-extrabold text-slate-900">{title}</div>
            <div className="mt-1 text-sm text-slate-500">
              <Link to="/company/properties" className="font-semibold text-slate-900 hover:underline">
                {t('propertyDetail.propertiesLink')}
              </Link>{' '}
              / {t('propertyDetail.breadcrumb')}
            </div>
          </div>
          {property?.assigned_manager ? (
            <ManagerBadge name={property.assigned_manager} variant="detail" />
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="gold" onClick={() => setShowBulk(true)}>
            {t('propertyDetail.bulkAdd')}
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
            {t('propertyDetail.edit')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('propertyDetail.infoTitle')}</CardTitle>
          <CardDescription>{t('propertyDetail.infoDesc')}</CardDescription>
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
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelName')}</div>
                <div className="mt-1 font-extrabold text-slate-900">{property.name}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelCategory')}</div>
                <div className="mt-1 font-extrabold text-slate-900">{translatePropertyCategory(property.category, lang)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelType')}</div>
                <div className="mt-1 font-extrabold text-slate-900">{translatePropertyType(property.type, lang)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelCapacity')}</div>
                <div className="mt-1 font-extrabold text-slate-900">{property.total_units_capacity}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelElecMeters')}</div>
                <div className="mt-1 font-extrabold text-slate-900">{property.electricity_meter_count ?? 0}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelWaterMeters')}</div>
                <div className="mt-1 font-extrabold text-slate-900">{property.water_meter_count ?? 0}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelDeed')}</div>
                <div className="mt-1 font-semibold text-slate-900">{property.deed_number || '-'}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:col-span-2">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelMaps')}</div>
                <div className="mt-1">
                  {property.maps_link ? (
                    <a href={property.maps_link} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">
                      {t('propertyDetail.labelMapsOpen')}
                    </a>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelOwner')}</div>
                <div className="mt-1 font-semibold text-slate-900">{ownerLabel || '-'}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelMgmtStart')}</div>
                <div className="mt-1 font-semibold text-slate-900">{property.management_start_date || '-'}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:col-span-2">
                <div className="text-xs font-bold text-slate-500">{t('propertyDetail.labelAssignedManager')}</div>
                <div className="mt-2">
                  {property.assigned_manager ? (
                    <ManagerBadge name={property.assigned_manager} variant="compact" />
                  ) : (
                    <span className="text-sm text-slate-500">{t('propertyDetail.assignedManagerEmpty')}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              {t('propertyDetail.notFound')}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>{t('propertyDetail.unitsTitle')}</CardTitle>
              <CardDescription>{t('propertyDetail.unitsDesc')}</CardDescription>
            </div>
            <ExportButton rows={unitExportRows} filename={t('propertyDetail.unitsExportName', { id })} disabled={unitsBusy} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-start text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">{t('propertyDetail.unitsColName')}</th>
                    <th className="px-4 py-3">{t('propertyDetail.unitsColType')}</th>
                    <th className="px-4 py-3">{t('propertyDetail.unitsColRooms')}</th>
                    <th className="px-4 py-3">{t('propertyDetail.unitsColStatus')}</th>
                    <th className="px-4 py-3">{t('propertyDetail.unitsColTargetRent')}</th>
                    <th className="px-4 py-3">{t('propertyDetail.unitsColElecMeter')}</th>
                    <th className="px-4 py-3">{t('propertyDetail.unitsColWaterMeter')}</th>
                    <th className="px-4 py-3">{t('propertyDetail.unitsColActions')}</th>
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
                        {t('propertyDetail.unitsEmpty')}
                      </td>
                    </tr>
                  ) : (
                    units.map((u) => (
                      <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">{u.unit_name}</td>
                        <td className="px-4 py-3 text-slate-700">{translatePropertyType(u.type, lang)}</td>
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
                            {translateUnitStatus(u.status, lang)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{u.target_rent_value}</td>
                        <td className="px-4 py-3 text-slate-600">{u.electricity_meter_ref || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{u.water_meter_ref || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button variant="subtle" size="sm" onClick={() => openEditUnit(u)}>
                              {t('propertyDetail.unitEdit')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => onUnitDelete(u.id)}>
                              {t('propertyDetail.unitHide')}
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
            <CardTitle>{t('propertyDetail.bulkModalTitle')}</CardTitle>
            <CardDescription>{t('propertyDetail.bulkModalDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onBulkCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>{t('propertyDetail.bulkNameLabel')}</Label>
                <Input value={baseName} onChange={(e) => setBaseName(e.target.value)} placeholder={t('propertyDetail.bulkNamePh')} required />
              </div>
              <div>
                <Label>{t('propertyDetail.bulkTypeLabel')}</Label>
                <Select value={unitType} onChange={(e) => setUnitType(e.target.value)} required>
                  {TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {translatePropertyType(ty, lang)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t('propertyDetail.bulkRentLabel')}</Label>
                <Input value={targetRent} onChange={(e) => setTargetRent(e.target.value)} type="number" min={0} step="0.01" required />
              </div>
              <div>
                <Label>{t('propertyDetail.bulkRoomsLabel')}</Label>
                <Input value={roomsCount} onChange={(e) => setRoomsCount(e.target.value)} type="number" min={1} step={1} required />
              </div>
              <div className="sm:col-span-2">
                <Label>{t('propertyDetail.bulkStatusLabel')}</Label>
                <Select value={unitStatus} onChange={(e) => setUnitStatus(e.target.value)} required>
                  {UNIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {translateUnitStatus(s, lang)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t('propertyDetail.bulkQuantityLabel')}</Label>
                <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min={1} step={1} required />
                <div className="mt-2 text-xs text-slate-500">{t('propertyDetail.bulkQuantityHelp')}</div>
              </div>

              <div className="sm:col-span-2 flex gap-3 pt-2">
                <Button variant="gold" className="flex-1" type="submit" disabled={saving}>
                  {saving ? t('propertyDetail.bulkSaving') : t('propertyDetail.bulkSave')}
                </Button>
                <Button variant="subtle" className="flex-1" type="button" onClick={() => setShowBulk(false)} disabled={saving}>
                  {t('propertyDetail.bulkCancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Modal>
      ) : null}

      <Modal open={showEditProperty} onClose={() => (propSaving ? null : setShowEditProperty(false))}>
        <CardHeader>
          <CardTitle>{t('propertyDetail.editPropertyTitle')}</CardTitle>
          <CardDescription>{t('propertyDetail.editPropertyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onUpdateProperty} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t('propertyCreate.nameLabel')}</Label>
              <Input value={propName} onChange={(e) => setPropName(e.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('propertyCreate.categoryLabel')}</Label>
              <Input value={propCategory} onChange={(e) => setPropCategory(e.target.value)} required />
            </div>
            <div>
              <Label>{t('propertyCreate.typeLabel')}</Label>
              <Select value={propType} onChange={(e) => setPropType(e.target.value)} required>
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {translatePropertyType(ty, lang)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('propertyCreate.capacityLabel')}</Label>
              <Input value={propCap} onChange={(e) => setPropCap(e.target.value)} type="number" min={0} step={1} required />
            </div>
            <div>
              <Label>{t('propertyDetail.labelElecMeters')}</Label>
              <Input value={propElecMeters} onChange={(e) => setPropElecMeters(e.target.value)} type="number" min={0} step={1} required />
            </div>
            <div>
              <Label>{t('propertyDetail.labelWaterMeters')}</Label>
              <Input value={propWaterMeters} onChange={(e) => setPropWaterMeters(e.target.value)} type="number" min={0} step={1} required />
            </div>
            <div>
              <Label>{t('propertyCreate.deedLabel')}</Label>
              <Input value={propDeed} onChange={(e) => setPropDeed(e.target.value)} />
            </div>
            <div>
              <Label>{t('propertyCreate.mapsLabel')}</Label>
              <Input value={propMaps} onChange={(e) => setPropMaps(e.target.value)} type="url" placeholder={t('propertyDetail.mapsPh')} />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <Label className="mb-0">{t('propertyCreate.ownerLabel')}</Label>
                <Button type="button" variant="subtle" size="sm" onClick={() => setShowOwnerQuick(true)} disabled={ownersBusy}>
                  {t('propertyCreate.ownerQuickAdd')}
                </Button>
              </div>
              <Combobox
                label=""
                value={propOwnerCrmId}
                onChange={(v) => setPropOwnerCrmId(String(v || ''))}
                options={ownerOptions}
                placeholder={t('propertyDetail.ownerPh')}
              />
            </div>
            <div>
              <Label>{t('propertyCreate.managementStartLabel')}</Label>
              <Input value={propMgmtDate} onChange={(e) => setPropMgmtDate(e.target.value)} type="date" />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('propertyCreate.assignedManagerLabel')}</Label>
              <Input
                value={propAssignedManager}
                onChange={(e) => setPropAssignedManager(e.target.value)}
                placeholder={t('propertyCreate.assignedManagerPh')}
                maxLength={120}
              />
              <div className="mt-1 text-xs text-slate-500">{t('propertyCreate.assignedManagerHelp')}</div>
            </div>
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <Button variant="gold" className="flex-1" type="submit" disabled={propSaving}>
                {propSaving ? t('propertyDetail.saving') : t('propertyDetail.save')}
              </Button>
              <Button variant="subtle" className="flex-1" type="button" onClick={() => setShowEditProperty(false)} disabled={propSaving}>
                {t('propertyDetail.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Modal>

      <Modal open={showOwnerQuick} onClose={() => (ownerQuickSaving ? null : setShowOwnerQuick(false))}>
        <CardHeader>
          <CardTitle>{t('propertyDetail.ownerAddTitle')}</CardTitle>
          <CardDescription>{t('propertyDetail.ownerAddDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onQuickCreateOwner} className="grid grid-cols-1 gap-3">
            <div>
              <Label>{t('propertyCreate.ownerFullName')}</Label>
              <Input value={quickOwnerName} onChange={(e) => setQuickOwnerName(e.target.value)} required />
            </div>
            <div>
              <Label>{t('propertyCreate.ownerNationalId')}</Label>
              <Input value={quickNational} onChange={(e) => setQuickNational(e.target.value)} required />
            </div>
            <div>
              <Label>{t('propertyCreate.ownerPhone')}</Label>
              <Input value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} required />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="gold" className="flex-1" type="submit" disabled={ownerQuickSaving}>
                {ownerQuickSaving ? t('propertyDetail.saving') : t('propertyDetail.ownerSave')}
              </Button>
              <Button variant="subtle" className="flex-1" type="button" onClick={() => setShowOwnerQuick(false)} disabled={ownerQuickSaving}>
                {t('propertyDetail.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Modal>

      <Modal open={Boolean(editingUnit)} onClose={() => (unitSaving ? null : setEditingUnit(null))}>
        <CardHeader>
          <CardTitle>{t('propertyDetail.editUnitTitle')}</CardTitle>
          <CardDescription>{t('propertyDetail.editUnitDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onUpdateUnit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t('propertyDetail.bulkNameLabel')}</Label>
              <Input value={editUnitName} onChange={(e) => setEditUnitName(e.target.value)} required />
            </div>
            <div>
              <Label>{t('propertyDetail.bulkTypeLabel')}</Label>
              <Select value={editUnitType} onChange={(e) => setEditUnitType(e.target.value)} required>
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {translatePropertyType(ty, lang)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('propertyDetail.bulkRentLabel')}</Label>
              <Input value={editUnitRent} onChange={(e) => setEditUnitRent(e.target.value)} type="number" min={0} step="0.01" required />
            </div>
            <div>
              <Label>{t('propertyDetail.bulkRoomsLabel')}</Label>
              <Input value={editRoomsCount} onChange={(e) => setEditRoomsCount(e.target.value)} type="number" min={1} step={1} required />
            </div>
            <div>
              <Label>{t('propertyDetail.bulkStatusLabel')}</Label>
              <Select value={editUnitStatus} onChange={(e) => setEditUnitStatus(e.target.value)} required>
                {UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {translateUnitStatus(s, lang)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>{t('propertyDetail.electricMeterLabel')}</Label>
              <Input value={editElecMeterRef} onChange={(e) => setEditElecMeterRef(e.target.value)} placeholder={t('propertyDetail.meterPh')} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('propertyDetail.waterMeterLabel')}</Label>
              <Input value={editWaterMeterRef} onChange={(e) => setEditWaterMeterRef(e.target.value)} placeholder={t('propertyDetail.meterPh')} />
            </div>
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <Button variant="gold" className="flex-1" type="submit" disabled={unitSaving}>
                {unitSaving ? t('propertyDetail.saving') : t('propertyDetail.save')}
              </Button>
              <Button variant="subtle" className="flex-1" type="button" onClick={() => setEditingUnit(null)} disabled={unitSaving}>
                {t('propertyDetail.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Modal>
    </div>
  )
}
