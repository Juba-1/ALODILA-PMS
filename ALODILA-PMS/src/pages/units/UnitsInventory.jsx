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
import { translateUnitStatus } from '../../lib/i18n/domainLabels'

const UNIT_TYPES = ['Residential', 'Commercial', 'Mixed']
const UNIT_STATUSES_AR = ['شاغرة', 'مؤجرة', 'تحت الصيانة', 'غير متاحة']

const TAB_KEYS = ['all', 'شاغرة', 'مؤجرة', 'تحت الصيانة', 'غير متاحة']

function statusBadge(status) {
  if (status === 'شاغرة') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'مؤجرة') return 'bg-red-50 text-red-700 ring-red-200'
  if (status === 'تحت الصيانة') return 'bg-amber-50 text-amber-800 ring-amber-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
}

export default function UnitsInventory() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const dir = lang === 'en' ? 'ltr' : 'rtl'
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

  const typeLabel = (raw) => {
    if (raw === 'Residential') return t('unitsInventory.typeResidential')
    if (raw === 'Commercial') return t('unitsInventory.typeCommercial')
    if (raw === 'Mixed') return t('unitsInventory.typeMixed')
    return raw || ''
  }

  const tabLabel = (key) => {
    if (key === 'all') return t('unitsInventory.tabAll')
    if (key === 'شاغرة') return t('unitsInventory.tabVacant')
    if (key === 'مؤجرة') return t('unitsInventory.tabLeased')
    if (key === 'تحت الصيانة') return t('unitsInventory.tabUnderMaintenance')
    if (key === 'غير متاحة') return t('unitsInventory.tabUnavailable')
    return key
  }

  async function refresh() {
    setBusy(true)
    try {
      const data = await getUnitsInventory()
      setItems(data)
    } catch (e) {
      reportLoadFailure(toastPush, e, t('unitsInventory.toastLoadFail'), true)
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
          reportLoadFailure(toastPush, e, t('unitsInventory.toastPropertiesFail'), true)
        }
      } finally {
        if (!cancelled) setRefsBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      [t('unitsInventory.colProperty')]: u.property_name || '',
      [t('unitsInventory.colCategory')]: u.property_category || '',
      [t('unitsInventory.colUnit')]: u.unit_name || '',
      [t('unitsInventory.colRooms')]: u.rooms_count ?? '',
      [t('unitsInventory.colStatus')]: translateUnitStatus(u.status || '', lang),
      [t('unitsInventory.colTargetRent')]: u.target_rent_value,
      [t('unitsInventory.colElecMeter')]: u.electricity_meter_ref || '',
      [t('unitsInventory.colWaterMeter')]: u.water_meter_ref || '',
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, i18n.language])

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
      toastPush({ type: 'error', title: t('unitsInventory.toastValidationTitle'), message: t('unitsInventory.toastValidationName') })
      return
    }
    if (!Number.isFinite(rent) || rent < 0) {
      toastPush({ type: 'error', title: t('unitsInventory.toastValidationTitle'), message: t('unitsInventory.toastValidationRent') })
      return
    }
    if (!Number.isFinite(rooms) || rooms < 1) {
      toastPush({ type: 'error', title: t('unitsInventory.toastValidationTitle'), message: t('unitsInventory.toastValidationRooms') })
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
      toastPush({ type: 'success', title: t('unitsInventory.toastUpdatedTitle'), message: t('unitsInventory.toastUpdatedMsg') })
      setEditOpen(false)
      setEditRow(null)
    } catch (err) {
      reportLoadFailure(toastPush, err, t('unitsInventory.toastUpdateFail'), true)
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
              <CardTitle>{t('unitsInventory.pageTitle')}</CardTitle>
              <CardDescription>{t('unitsInventory.pageDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton rows={exportRows} filename={t('unitsInventory.exportFilename')} disabled={busy} />
              <TargetedPdfButton
                disabled={busy}
                onClick={() =>
                  exportReportPdf({
                    title: t('unitsInventory.pdfTitle'),
                    subtitle: t('unitsInventory.pdfSubtitle'),
                    filename: 'units-inventory',
                    metaLines: [
                      `${t('common.date')}: ${new Date().toISOString().slice(0, 10)}`,
                      `${t('contractsList.pdfRowsLabel')}: ${exportRows.length}`,
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
            {TAB_KEYS.map((key) => (
              <Button
                key={key}
                variant={tab === key ? 'gold' : 'subtle'}
                size="sm"
                onClick={() => setTab(key)}
              >
                {tabLabel(key)}
              </Button>
            ))}
          </div>

          <AdvancedFilterBar>
            <div>
              <Label>{t('unitsInventory.filterProperty')}</Label>
              <Select value={filterPropertyId} onChange={(e) => setFilterPropertyId(e.target.value)} disabled={refsBusy}>
                <option value="">{t('unitsInventory.filterAllProperties')}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('unitsInventory.filterPropertyCategory')}</Label>
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="">{t('unitsInventory.filterAllCategories')}</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('unitsInventory.filterUnitStatus')}</Label>
              <Select value={advStatus} onChange={(e) => setAdvStatus(e.target.value)}>
                <option value="">{t('unitsInventory.filterFollowTab')}</option>
                {UNIT_STATUSES_AR.map((s) => (
                  <option key={s} value={s}>
                    {translateUnitStatus(s, lang)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('unitsInventory.filterRoomsMin')}</Label>
              <Input inputMode="numeric" value={roomsMin} onChange={(e) => setRoomsMin(e.target.value)} placeholder={t('unitsInventory.filterRoomsMinPh')} />
            </div>
            <div>
              <Label>{t('unitsInventory.filterRoomsMax')}</Label>
              <Input inputMode="numeric" value={roomsMax} onChange={(e) => setRoomsMax(e.target.value)} placeholder={t('unitsInventory.filterRoomsMaxPh')} />
            </div>
          </AdvancedFilterBar>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>{t('unitsInventory.searchLabel')}</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('unitsInventory.searchPlaceholder')} />
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                {t('unitsInventory.totalLabel')}: <span className="font-bold text-slate-900">{filtered.length}</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-start text-xs font-bold text-slate-600">
                    <th className="px-4 py-3">{t('unitsInventory.colProperty')}</th>
                    <th className="px-4 py-3">{t('unitsInventory.colCategory')}</th>
                    <th className="px-4 py-3">{t('unitsInventory.colUnit')}</th>
                    <th className="px-4 py-3">{t('unitsInventory.colRooms')}</th>
                    <th className="px-4 py-3">{t('unitsInventory.colStatus')}</th>
                    <th className="px-4 py-3">{t('unitsInventory.colTargetRent')}</th>
                    <th className="px-4 py-3">{t('unitsInventory.colActions')}</th>
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
                        {t('unitsInventory.emptyFiltered')}
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
                            {translateUnitStatus(u.status, lang)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{u.target_rent_value}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="subtle" size="sm" onClick={() => openUnitEdit(u)}>
                              {t('unitsInventory.editAction')}
                            </Button>
                            <Link to={`/properties/${u.property_id}`}>
                              <Button type="button" variant="ghost" size="sm">
                                {t('unitsInventory.propertyAction')}
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

      <Modal open={editOpen} onClose={() => (editSaving ? null : setEditOpen(false))} title={t('unitsInventory.modalEditTitle')}>
        <form onSubmit={onSaveUnitEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 text-xs text-slate-500">
            {editRow ? (
              <>
                {t('unitsInventory.modalPropertyLabel')}: <span className="font-semibold text-slate-800">{editRow.property_name}</span>
              </>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label>{t('unitsInventory.fieldUnitName')}</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label>{t('unitsInventory.fieldType')}</Label>
            <Select value={editType} onChange={(e) => setEditType(e.target.value)} className="mt-1">
              {UNIT_TYPES.map((raw) => (
                <option key={raw} value={raw}>
                  {typeLabel(raw)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('unitsInventory.fieldTargetRent')}</Label>
            <Input value={editRent} onChange={(e) => setEditRent(e.target.value)} type="number" min={0} step="0.01" required className="mt-1" />
          </div>
          <div>
            <Label>{t('unitsInventory.fieldRooms')}</Label>
            <Input value={editRooms} onChange={(e) => setEditRooms(e.target.value)} type="number" min={1} step={1} required className="mt-1" />
          </div>
          <div>
            <Label>{t('unitsInventory.fieldStatus')}</Label>
            <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="mt-1">
              {UNIT_STATUSES_AR.map((s) => (
                <option key={s} value={s}>
                  {translateUnitStatus(s, lang)}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>{t('unitsInventory.fieldElecRef')}</Label>
            <Input value={editElec} onChange={(e) => setEditElec(e.target.value)} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label>{t('unitsInventory.fieldWaterRef')}</Label>
            <Input value={editWater} onChange={(e) => setEditWater(e.target.value)} className="mt-1" />
          </div>
          <div className="sm:col-span-2 flex gap-2 pt-2">
            <Button variant="gold" type="submit" className="flex-1" disabled={editSaving}>
              {editSaving ? t('common.saving') : t('common.save')}
            </Button>
            <Button variant="subtle" type="button" className="flex-1" onClick={() => setEditOpen(false)} disabled={editSaving}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
