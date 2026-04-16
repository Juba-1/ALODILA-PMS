import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

const TYPES = ['Residential', 'Commercial', 'Mixed']
const CATEGORIES = ['عمارة', 'مجمع سكني', 'فيلا', 'دوبلكس', 'مستودع', 'معرض', 'أرض', 'مبنى تجاري']

function typeLabel(t) {
  if (t === 'Residential') return 'سكني'
  if (t === 'Commercial') return 'تجاري'
  if (t === 'Mixed') return 'مختلط'
  return t
}

export default function PropertyCreate() {
  const navigate = useNavigate()
  const { push } = useToastDispatch()
  const toastPush = useCallback((payload) => push(payload), [push])
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [type, setType] = useState('Residential')
  const [deedNumber, setDeedNumber] = useState('')
  const [mapsLink, setMapsLink] = useState('')
  const [totalUnitsCapacity, setTotalUnitsCapacity] = useState('')
  const [ownerCrmId, setOwnerCrmId] = useState('')
  const [managementStartDate, setManagementStartDate] = useState('')
  const [electricityMeterCount, setElectricityMeterCount] = useState('0')
  const [waterMeterCount, setWaterMeterCount] = useState('0')

  const [owners, setOwners] = useState([])
  const [ownersBusy, setOwnersBusy] = useState(true)
  const [showOwnerQuick, setShowOwnerQuick] = useState(false)
  const [quickOwnerName, setQuickOwnerName] = useState('')
  const [quickNational, setQuickNational] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [ownerQuickSaving, setOwnerQuickSaving] = useState(false)

  const title = useMemo(() => 'إنشاء عقار جديد', [])

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

  const ownerOptions = useMemo(() => {
    return (owners || []).map((o) => ({
      value: o.id,
      label: `${o.full_name || 'مالك'} — ${o.national_id || ''}`,
    }))
  }, [owners])

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
      setOwnerCrmId(created.id)
      setShowOwnerQuick(false)
      setQuickOwnerName('')
      setQuickNational('')
      setQuickPhone('')
      push({ type: 'success', title: 'تمت الإضافة', message: 'تم إضافة المالك إلى CRM.' })
    } catch (err) {
      reportLoadFailure(toastPush, err, 'فشل إضافة المالك', true)
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
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'يرجى إدخال قيمة صحيحة للسعة الإجمالية للوحدات.' })
      return
    }
    if (!Number.isFinite(ec) || ec < 0 || !Number.isFinite(wc) || wc < 0) {
      push({ type: 'error', title: 'تحقق من المدخلات', message: 'عدد العدادات يجب أن يكون رقمًا صحيحًا (0 أو أكثر).' })
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
      })
      push({ type: 'success', title: 'تم إنشاء العقار بنجاح' })
      navigate('/properties', { replace: true })
    } catch (err) {
      reportLoadFailure(toastPush, err, 'فشل إنشاء العقار', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>مطابق لقاموس البيانات في PRD v2 (بدون أي حقول إضافية)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>اسم العقار (إلزامي)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="مثال: برج العضيلة" />
            </div>

            <div className="sm:col-span-2">
              <Combobox
                label="تصنيف العقار (إلزامي)"
                value={category}
                onChange={setCategory}
                options={CATEGORIES}
                placeholder="ابحث عن التصنيف..."
                required
              />
            </div>

            <div>
              <Label>نوع العقار</Label>
              <Select value={type} onChange={(e) => setType(e.target.value)} required>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>السعة الإجمالية للوحدات (إلزامي)</Label>
              <Input
                value={totalUnitsCapacity}
                onChange={(e) => setTotalUnitsCapacity(e.target.value)}
                required
                inputMode="numeric"
                type="number"
                min={0}
                step={1}
                placeholder="مثال: 24"
              />
            </div>

            <div>
              <Label>عدادات الكهرباء — العدد (اتفاقية)</Label>
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
              <Label>عدادات المياه — العدد (اتفاقية)</Label>
              <Input value={waterMeterCount} onChange={(e) => setWaterMeterCount(e.target.value)} type="number" min={0} step={1} required />
            </div>

            <div>
              <Label>رقم الصك (اختياري)</Label>
              <Input value={deedNumber} onChange={(e) => setDeedNumber(e.target.value)} placeholder="مثال: 1234567890" />
            </div>

            <div>
              <Label>رابط خرائط Google (اختياري)</Label>
              <Input
                value={mapsLink}
                onChange={(e) => setMapsLink(e.target.value)}
                type="url"
                placeholder="https://maps.google.com/..."
              />
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
                value={ownerCrmId}
                onChange={(v) => setOwnerCrmId(String(v || ''))}
                options={ownerOptions}
                placeholder="ابحث بالاسم أو رقم الهوية..."
              />
            </div>

            <div>
              <Label>تاريخ بداية الإدارة (اختياري)</Label>
              <Input value={managementStartDate} onChange={(e) => setManagementStartDate(e.target.value)} type="date" />
            </div>

            <div className="sm:col-span-2 mt-2 flex gap-3">
              <Button variant="gold" type="submit" disabled={busy} className="flex-1">
                {busy ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
              <Button variant="subtle" type="button" onClick={() => navigate('/properties')} className="flex-1">
                رجوع
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Modal open={showOwnerQuick} onClose={() => (ownerQuickSaving ? null : setShowOwnerQuick(false))}>
        <CardHeader>
          <CardTitle>إضافة مالك (CRM)</CardTitle>
          <CardDescription>سيتم ربط المالك بالعقار بعد الحفظ</CardDescription>
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
    </div>
  )
}

