import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Combobox } from '../../components/ui/Combobox'
import { Modal } from '../../components/ui/Modal'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { createOwner, getOwners } from '../../lib/db/owners'
import { createProperty } from '../../lib/db/properties'
import { isIgnorableAuthLockError, reportLoadFailure } from '../../lib/supabase/authErrors'
import { translatePropertyCategory, translatePropertyType } from '../../lib/i18n/domainLabels'
import { naturalCompare } from '../../lib/sort/naturalCompare'

const TYPES = ['Residential', 'Commercial', 'Mixed']
const CATEGORIES = ['عمارة', 'مجمع سكني', 'فيلا', 'دوبلكس', 'مستودع', 'معرض', 'أرض', 'مبنى تجاري']

export default function PropertyCreate() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const navigate = useNavigate()
  const { push } = useToastDispatch()
  const toastPush = useCallback((payload) => push(payload), [push])
  const tRef = useRef(t)
  tRef.current = t
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [type, setType] = useState('Residential')
  const [deedNumber, setDeedNumber] = useState('')
  const [mapsLink, setMapsLink] = useState('')
  const [totalUnitsCapacity, setTotalUnitsCapacity] = useState('')
  const [ownerCrmId, setOwnerCrmId] = useState('')
  const [managementStartDate, setManagementStartDate] = useState('')
  const [assignedManager, setAssignedManager] = useState('')
  const [electricityMeterCount, setElectricityMeterCount] = useState('0')
  const [waterMeterCount, setWaterMeterCount] = useState('0')

  const [owners, setOwners] = useState([])
  const [ownersBusy, setOwnersBusy] = useState(true)
  const [showOwnerQuick, setShowOwnerQuick] = useState(false)
  const [quickOwnerName, setQuickOwnerName] = useState('')
  const [quickNational, setQuickNational] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [ownerQuickSaving, setOwnerQuickSaving] = useState(false)

  const title = useMemo(() => t('propertyCreate.title'), [t])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setOwnersBusy(true)
      try {
        const list = await getOwners()
        if (!cancelled) setOwners(list)
      } catch (e) {
        if (!cancelled && !isIgnorableAuthLockError(e)) {
          reportLoadFailure(toastPush, e, tRef.current('propertyCreate.toastLoadOwnersFail'), true)
        }
      } finally {
        if (!cancelled) setOwnersBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toastPush])

  const categoryOptions = useMemo(
    () => CATEGORIES.map((c) => ({ value: c, label: translatePropertyCategory(c, lang) || c })),
    [lang]
  )

  const ownerOptions = useMemo(() => {
    return (owners || []).map((o) => ({
      value: o.id,
      label: `${o.full_name || t('propertyCreate.ownerFallback')} — ${o.national_id || ''}`,
    }))
  }, [owners, t])

  async function onQuickCreateOwner(e) {
    e.preventDefault()
    const nm = String(quickOwnerName || '').trim()
    const nat = String(quickNational || '').trim()
    const ph = String(quickPhone || '').trim()
    if (!nm || !nat || !ph) {
      push({ type: 'error', title: t('propertyCreate.toastInvalidInputTitle'), message: t('propertyCreate.toastInvalidOwnerMsg') })
      return
    }
    setOwnerQuickSaving(true)
    try {
      const created = await createOwner({ full_name: nm, national_id: nat, phone: ph })
      setOwners((prev) => [...prev, created].sort((a, b) => naturalCompare(a.full_name, b.full_name)))
      setOwnerCrmId(created.id)
      setShowOwnerQuick(false)
      setQuickOwnerName('')
      setQuickNational('')
      setQuickPhone('')
      push({ type: 'success', title: t('propertyCreate.toastAddedTitle'), message: t('propertyCreate.toastOwnerAddedMsg') })
    } catch (err) {
      reportLoadFailure(toastPush, err, t('propertyCreate.toastOwnerFail'), true)
    } finally {
      setOwnerQuickSaving(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()

    const capacityNum = Number(totalUnitsCapacity)
    const ec = Number(electricityMeterCount)
    const wc = Number(waterMeterCount)
    if (!Number.isFinite(capacityNum) || capacityNum < 0) {
      push({ type: 'error', title: t('propertyCreate.toastInvalidInputTitle'), message: t('propertyCreate.toastCapacityInvalid') })
      return
    }
    if (!Number.isFinite(ec) || ec < 0 || !Number.isFinite(wc) || wc < 0) {
      push({ type: 'error', title: t('propertyCreate.toastInvalidInputTitle'), message: t('propertyCreate.toastMetersInvalid') })
      return
    }

    setBusy(true)
    try {
      await createProperty({
        name,
        category,
        type,
        deed_number: deedNumber,
        maps_link: mapsLink,
        total_units_capacity: capacityNum,
        electricity_meter_count: ec,
        water_meter_count: wc,
        owner_crm_id: String(ownerCrmId || '').trim() || null,
        management_start_date: managementStartDate || null,
        assigned_manager: assignedManager,
      })
      push({ type: 'success', title: t('propertyCreate.toastPropertyCreated') })
      navigate('/company/properties', { replace: true })
    } catch (err) {
      reportLoadFailure(toastPush, err, t('propertyCreate.toastPropertyFail'), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{t('propertyCreate.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t('propertyCreate.nameLabel')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={t('propertyCreate.namePh')} />
            </div>

            <div className="sm:col-span-2">
              <Combobox
                label={t('propertyCreate.categoryLabel')}
                value={category}
                onChange={setCategory}
                options={categoryOptions}
                placeholder={t('propertyCreate.categoryPh')}
                required
              />
            </div>

            <div>
              <Label>{t('propertyCreate.typeLabel')}</Label>
              <Select value={type} onChange={(e) => setType(e.target.value)} required>
                {TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {translatePropertyType(tp, lang)}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>{t('propertyCreate.capacityLabel')}</Label>
              <Input
                value={totalUnitsCapacity}
                onChange={(e) => setTotalUnitsCapacity(e.target.value)}
                required
                inputMode="numeric"
                type="number"
                min={0}
                step={1}
                placeholder={t('propertyCreate.capacityPh')}
              />
            </div>

            <div>
              <Label>{t('propertyCreate.electricityMeters')}</Label>
              <Input
                value={electricityMeterCount}
                onChange={(e) => setElectricityMeterCount(e.target.value)}
                type="number"
                min={0}
                step={1}
                required
              />
            </div>
            <div>
              <Label>{t('propertyCreate.waterMeters')}</Label>
              <Input value={waterMeterCount} onChange={(e) => setWaterMeterCount(e.target.value)} type="number" min={0} step={1} required />
            </div>

            <div>
              <Label>{t('propertyCreate.deedLabel')}</Label>
              <Input value={deedNumber} onChange={(e) => setDeedNumber(e.target.value)} placeholder={t('propertyCreate.deedPh')} />
            </div>

            <div>
              <Label>{t('propertyCreate.mapsLabel')}</Label>
              <Input
                value={mapsLink}
                onChange={(e) => setMapsLink(e.target.value)}
                type="url"
                placeholder={t('propertyCreate.mapsPh')}
              />
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
                value={ownerCrmId}
                onChange={(v) => setOwnerCrmId(String(v || ''))}
                options={ownerOptions}
                placeholder={t('propertyCreate.ownerPh')}
              />
            </div>

            <div>
              <Label>{t('propertyCreate.managementStartLabel')}</Label>
              <Input value={managementStartDate} onChange={(e) => setManagementStartDate(e.target.value)} type="date" />
            </div>

            <div className="sm:col-span-2">
              <Label>{t('propertyCreate.assignedManagerLabel')}</Label>
              <Input
                value={assignedManager}
                onChange={(e) => setAssignedManager(e.target.value)}
                placeholder={t('propertyCreate.assignedManagerPh')}
                maxLength={120}
              />
              <div className="mt-1 text-xs text-slate-500">{t('propertyCreate.assignedManagerHelp')}</div>
            </div>

            <div className="sm:col-span-2 mt-2 flex gap-3">
              <Button variant="gold" type="submit" disabled={busy} className="flex-1">
                {busy ? t('propertyCreate.saving') : t('propertyCreate.save')}
              </Button>
              <Button variant="subtle" type="button" onClick={() => navigate('/company/properties')} className="flex-1">
                {t('propertyCreate.back')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Modal open={showOwnerQuick} onClose={() => (ownerQuickSaving ? null : setShowOwnerQuick(false))}>
        <CardHeader>
          <CardTitle>{t('propertyCreate.ownerModalTitle')}</CardTitle>
          <CardDescription>{t('propertyCreate.ownerModalDesc')}</CardDescription>
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
                {ownerQuickSaving ? t('propertyCreate.saving') : t('propertyCreate.ownerSaveBtn')}
              </Button>
              <Button variant="subtle" className="flex-1" type="button" onClick={() => setShowOwnerQuick(false)} disabled={ownerQuickSaving}>
                {t('propertyCreate.ownerCancelBtn')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Modal>
    </div>
  )
}
