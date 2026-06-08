import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label, Textarea } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { cn } from '../../components/ui/cn'
import { contractFormPayloadSchema, zodFirstIssueMessage } from '../../lib/validation/schemas'
import { computeInstallmentSchedule, monthsBetween } from '../../lib/finance/schedule'

const BILLING_VALUES = ['شهري', 'ربع سنوي', 'نصف سنوي', 'سنوي']
const STATUS_VALUES = ['ساري', 'منتهي', 'ملغى', 'نزاع قانوني']
const UTILITY_PAYMENT_TYPES = [
  { value: 'مستقل', key: 'independent' },
  { value: 'مشترك', key: 'shared' },
  { value: 'شامل', key: 'included' },
  { value: 'مقطوع', key: 'flat' },
]

function contractUnitId(c) {
  return c?.unit_id || c?.unit?.id || ''
}

function contractSecondaryUnitIds(c) {
  if (!Array.isArray(c?.secondary_unit_ids)) return []
  return c.secondary_unit_ids.filter(Boolean)
}

/** Units blocked for *new* ساري contracts: main or secondary on another ساري row. */
function buildOccupiedUnitMap(existingContracts, excludeContractId) {
  const m = new Map()
  for (const c of existingContracts || []) {
    if (c?.status !== 'ساري') continue
    if (excludeContractId && c.id === excludeContractId) continue
    const label = c.tenant_full_name || ''
    const linked = [contractUnitId(c), ...contractSecondaryUnitIds(c)].filter(Boolean)
    for (const uid of linked) {
      if (!m.has(uid)) m.set(uid, label)
    }
  }
  return m
}

export default function ContractForm({ initialValue, tenants, units, existingContracts = [], busy, onSubmit, onCancel }) {
  const { t, i18n } = useTranslation()
  const numberLocale = (i18n.language?.startsWith('en') ? 'en-US' : 'ar-SA') + '-u-nu-latn'
  const isEdit = Boolean(initialValue?.id)

  const [tenantId, setTenantId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [ejar, setEjar] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [handoverDate, setHandoverDate] = useState('')
  const [value, setValue] = useState('')
  const [deposit, setDeposit] = useState('0')
  const [cycle, setCycle] = useState('شهري')
  const [status, setStatus] = useState('ساري')
  const [utilityType, setUtilityType] = useState('مستقل')
  const [utilityFlat, setUtilityFlat] = useState('')
  const [handoverNotes, setHandoverNotes] = useState('')
  const [secondaryUnitIds, setSecondaryUnitIds] = useState([])
  const [autoSchedule, setAutoSchedule] = useState(true)
  const [regeneratePending, setRegeneratePending] = useState(false)
  const [vatApplicable, setVatApplicable] = useState(false)

  const [tenantQ, setTenantQ] = useState('')
  const [unitQ, setUnitQ] = useState('')
  const [userEditedContractValue, setUserEditedContractValue] = useState(false)
  const [formError, setFormError] = useState('')

  const billingOptions = useMemo(
    () => BILLING_VALUES.map((v) => ({ value: v, label: t(`billingCycle.${v}`, { defaultValue: v }) })),
    [t],
  )
  const statusOptions = useMemo(
    () => STATUS_VALUES.map((v) => ({ value: v, label: t(`contractStatus.${v}`, { defaultValue: v }) })),
    [t],
  )

  const title = useMemo(() => (isEdit ? t('contractsForm.titleEdit') : t('contractsForm.titleCreate')), [isEdit, t])

  const occupiedByUnit = useMemo(
    () => buildOccupiedUnitMap(existingContracts, isEdit ? initialValue?.id : null),
    [existingContracts, isEdit, initialValue?.id],
  )

  function isUnitSelectableForStatus(u, nextStatus) {
    if (!u?.id) return false
    if (nextStatus !== 'ساري') return true
    const blocker = occupiedByUnit.get(u.id)
    if (!blocker) return true
    if (isEdit && initialValue?.unit_id === u.id) return true
    return false
  }

  const vacantCount = useMemo(() => {
    let n = 0
    for (const u of units || []) {
      if (!occupiedByUnit.has(u.id)) n += 1
    }
    return n
  }, [units, occupiedByUnit])

  useEffect(() => {
    setTenantId(initialValue?.tenant_id || '')
    setUnitId(initialValue?.unit_id || '')
    setEjar(initialValue?.ejar_contract_number || '')
    setStartDate(initialValue?.start_date || '')
    setEndDate(initialValue?.end_date || '')
    setHandoverDate(initialValue?.actual_handover_date || '')
    setValue(initialValue?.contract_value != null ? String(initialValue.contract_value) : '')
    setDeposit(initialValue?.deposit != null ? String(initialValue.deposit) : '0')
    setCycle(initialValue?.billing_cycle || 'شهري')
    setStatus(initialValue?.status || 'ساري')
    setUtilityType(initialValue?.utility_payment_type || 'مستقل')
    setUtilityFlat(
      initialValue?.utility_payment_type === 'مقطوع' && initialValue?.utility_flat_amount_sar != null
        ? String(initialValue.utility_flat_amount_sar)
        : '',
    )
    setHandoverNotes(initialValue?.handover_notes != null ? String(initialValue.handover_notes) : '')
    setSecondaryUnitIds(Array.isArray(initialValue?.secondary_unit_ids) ? [...initialValue.secondary_unit_ids] : [])
    setAutoSchedule(!isEdit)
    setRegeneratePending(false)
    setVatApplicable(false)
    setUserEditedContractValue(false)
    setFormError('')
    setTenantQ('')
    setUnitQ('')
  }, [initialValue, isEdit])

  useEffect(() => {
    if (isEdit || userEditedContractValue) return
    const u = (units || []).find((x) => x.id === unitId)
    if (!u || unitId === '') return
    const tr = Number(u.target_rent_value)
    if (!Number.isFinite(tr) || tr < 0) return
    const months = startDate && endDate ? monthsBetween(startDate, endDate) : 0
    const total = months > 0 ? Math.round(tr * months * 100) / 100 : tr
    setValue(String(total))
  }, [unitId, units, isEdit, userEditedContractValue, startDate, endDate])

  useEffect(() => {
    if (!unitId) return
    setSecondaryUnitIds((prev) => (prev.includes(unitId) ? prev.filter((id) => id !== unitId) : prev))
  }, [unitId])

  useEffect(() => {
    if (status !== 'ساري' || !unitId) return
    const u = (units || []).find((x) => x.id === unitId)
    if (!u) return
    if (!isUnitSelectableForStatus(u, 'ساري')) {
      setUnitId('')
      setFormError(t('validation.unitCleared'))
    }
  }, [status, unitId, units, isEdit, initialValue?.unit_id, occupiedByUnit, t])

  const filteredTenants = useMemo(() => {
    const n = tenantQ.trim().toLowerCase()
    if (!n) return tenants
    return tenants.filter((x) => `${x.full_name || ''} ${x.national_id_or_cr || ''}`.toLowerCase().includes(n))
  }, [tenants, tenantQ])

  const filteredUnits = useMemo(() => {
    const n = unitQ.trim().toLowerCase()
    const list = n
      ? (units || []).filter((u) => `${u.unit_name || ''} ${u.property_name || ''}`.toLowerCase().includes(n))
      : units || []
    return list
  }, [units, unitQ])

  const schedulePreview = useMemo(() => {
    return computeInstallmentSchedule({
      contract_value: value,
      start_date: startDate,
      end_date: endDate,
      billing_cycle: cycle,
      utility_payment_type: utilityType,
      utility_flat_amount_sar: utilityType === 'مقطوع' ? utilityFlat : null,
      vat_applicable: vatApplicable,
    })
  }, [value, startDate, endDate, cycle, utilityType, utilityFlat, vatApplicable])

  function validateBeforeSubmit() {
    setFormError('')
    const u = (units || []).find((x) => x.id === unitId)
    if (!u) {
      setFormError(t('validation.selectUnit'))
      return false
    }
    if (status === 'ساري' && !isUnitSelectableForStatus(u, status)) {
      setFormError(t('validation.unitOccupied'))
      return false
    }
    for (const sid of secondaryUnitIds) {
      const su = (units || []).find((x) => x.id === sid)
      if (!su) {
        setFormError(t('validation.selectUnit'))
        return false
      }
      if (status === 'ساري' && !isUnitSelectableForStatus(su, status)) {
        setFormError(t('validation.unitOccupied'))
        return false
      }
    }
    return true
  }

  const secondaryUnitCandidates = useMemo(() => {
    return (units || []).filter((u) => u?.id && u.id !== unitId)
  }, [units, unitId])

  function toggleSecondaryUnit(id) {
    setSecondaryUnitIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setFormError('')
  }

  const occupiedBadge = t('contractsForm.occupiedBadge')

  return (
    <>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {t('contractsForm.desc')}
          {!isEdit && units?.length ? (
            <span className="mt-1 block text-xs font-semibold text-slate-600">
              {t('contractsForm.vacantForActive', { vacant: vacantCount, total: units.length })}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!validateBeforeSubmit()) return
            const payload = {
              tenant_id: tenantId,
              unit_id: unitId,
              ejar_contract_number: ejar || null,
              start_date: startDate,
              end_date: endDate,
              actual_handover_date: handoverDate || null,
              contract_value: value,
              deposit,
              billing_cycle: cycle,
              status,
              utility_payment_type: utilityType,
              utility_flat_amount_sar: utilityType === 'مقطوع' ? utilityFlat : null,
              handover_notes: handoverNotes.trim() ? handoverNotes.trim() : null,
              secondary_unit_ids: secondaryUnitIds,
            }
            const zr = contractFormPayloadSchema.safeParse(payload)
            if (!zr.success) {
              setFormError(zodFirstIssueMessage(zr.error))
              return
            }
            onSubmit?.({
              tenant_id: tenantId,
              unit_id: unitId,
              ejar_contract_number: ejar,
              start_date: startDate,
              end_date: endDate,
              actual_handover_date: handoverDate,
              contract_value: value,
              deposit,
              billing_cycle: cycle,
              status,
              utility_payment_type: utilityType,
              utility_flat_amount_sar: utilityType === 'مقطوع' ? utilityFlat : null,
              handover_notes: handoverNotes.trim() ? handoverNotes.trim() : null,
              secondary_unit_ids: secondaryUnitIds,
              _schedule: {
                auto: Boolean(autoSchedule) && !isEdit,
                regeneratePending: Boolean(regeneratePending) && isEdit,
                vat_applicable: Boolean(vatApplicable),
              },
            })
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <Label>{t('contractsForm.tenantLabel')}</Label>
            <Input
              value={tenantQ}
              onChange={(e) => setTenantQ(e.target.value)}
              placeholder={t('contractsForm.tenantSearchPh')}
              className="mt-1"
            />
            <div className="mt-2">
              <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)} required autoFocus>
                <option value="" disabled>
                  {t('contractsForm.tenantPlaceholder')}
                </option>
                {filteredTenants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.full_name} — {x.national_id_or_cr}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <Label>{t('contractsForm.unitLabel')}</Label>
            <Input value={unitQ} onChange={(e) => setUnitQ(e.target.value)} placeholder={t('contractsForm.unitSearchPh')} className="mt-1" />
            <p className="mt-1 text-xs text-slate-500">{t('contractsForm.unitHelp')}</p>
            <div className="mt-2">
              <Select
                value={unitId}
                onChange={(e) => {
                  setUnitId(e.target.value)
                  setFormError('')
                }}
                required
              >
                <option value="" disabled>
                  {t('contractsForm.unitPlaceholder')}
                </option>
                {filteredUnits.map((u) => {
                  const blocked = occupiedByUnit.has(u.id)
                  const label = `${u.unit_name || ''}${u.property_name ? ` — ${u.property_name}` : ''}`
                  const disabled = status === 'ساري' && !isUnitSelectableForStatus(u, 'ساري')
                  return (
                    <option key={u.id} value={u.id} disabled={disabled}>
                      {label}
                      {blocked ? ` ${occupiedBadge}` : ''}
                    </option>
                  )
                })}
              </Select>
            </div>
          </div>

          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <Label>الوحدات الإضافية المرتبطة</Label>
            <p className="mt-1 text-xs text-slate-500">اختياري — وحدات إضافية تُؤجَّر ضمن نفس العقد (تأجير مجمّع B2B).</p>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
              {secondaryUnitCandidates.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-500">لا توجد وحدات أخرى متاحة للاختيار.</p>
              ) : (
                secondaryUnitCandidates.map((u) => {
                  const blocked = occupiedByUnit.has(u.id)
                  const disabled = status === 'ساري' && !isUnitSelectableForStatus(u, 'ساري')
                  const checked = secondaryUnitIds.includes(u.id)
                  const label = `${u.unit_name || ''}${u.property_name ? ` — ${u.property_name}` : ''}`
                  return (
                    <label
                      key={u.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-emerald-600"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleSecondaryUnit(u.id)}
                      />
                      <span className="text-slate-800">
                        {label}
                        {blocked ? ` ${occupiedBadge}` : ''}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
            {secondaryUnitIds.length > 0 ? (
              <p className="mt-2 text-xs font-semibold text-emerald-800">
                {secondaryUnitIds.length} وحدة إضافية محددة
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <Label>{t('contractsForm.ejarLabel')}</Label>
            <Input value={ejar} onChange={(e) => setEjar(e.target.value)} placeholder={t('contractsForm.ejarPh')} />
          </div>

          <div>
            <Label>{t('contractsForm.startLabel')}</Label>
            <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" required />
          </div>
          <div>
            <Label>{t('contractsForm.endLabel')}</Label>
            <Input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" required />
          </div>

          <div className="sm:col-span-2">
            <Label>{t('contractsForm.handoverLabel')}</Label>
            <Input value={handoverDate} onChange={(e) => setHandoverDate(e.target.value)} type="date" />
          </div>

          <div className="sm:col-span-2">
            <Label>{t('contractsForm.handoverNotesLabel')}</Label>
            <Textarea value={handoverNotes} onChange={(e) => setHandoverNotes(e.target.value)} placeholder={t('contractsForm.handoverNotesPh')} rows={8} className="mt-1 min-h-[10rem]" />
            <p className="mt-1 text-xs text-slate-500">{t('contractsForm.handoverNotesHelp')}</p>
          </div>

          <div>
            <Label>{t('contractsForm.contractValueTotalLabel')}</Label>
            <Input
              value={value}
              onChange={(e) => {
                setUserEditedContractValue(true)
                setValue(e.target.value)
              }}
              type="number"
              min={0}
              step="0.01"
              required
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {schedulePreview.monthly_rent_equivalent
                ? t('contractsForm.equivalentMonthlyHint', {
                    amount: schedulePreview.monthly_rent_equivalent.toLocaleString(numberLocale),
                    months: schedulePreview.months_total,
                  })
                : t('contractsForm.valueDistributeHint')}
            </p>
            {!isEdit && unitId ? (
              <p className="mt-1 text-[11px] text-slate-500">{t('contractsForm.autoPrefillHint')}</p>
            ) : null}
          </div>
          <div>
            <Label>{t('contractsForm.depositLabel')}</Label>
            <Input value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" min={0} step="0.01" required />
          </div>

          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <Label>{t('contractsForm.utilityTypeLabel')}</Label>
            <Select
              value={utilityType}
              onChange={(e) => {
                const v = e.target.value
                setUtilityType(v)
                if (v !== 'مقطوع') setUtilityFlat('')
                setFormError('')
              }}
              className="mt-1"
            >
              {UTILITY_PAYMENT_TYPES.map((u) => (
                <option key={u.value} value={u.value}>
                  {t(`contractsForm.utilityType.${u.key}`, { defaultValue: u.value })}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-xs text-slate-600">{t('contractsForm.utilityHelp')}</p>
            {utilityType === 'مقطوع' ? (
              <div className="mt-3">
                <Label>{t('contractsForm.utilityFlatLabel')}</Label>
                <Input
                  value={utilityFlat}
                  onChange={(e) => setUtilityFlat(e.target.value)}
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-slate-500">{t('contractsForm.utilityFlatHint')}</p>
              </div>
            ) : null}
          </div>

          <div>
            <Label>{t('contractsForm.billingLabel')}</Label>
            <Select value={cycle} onChange={(e) => setCycle(e.target.value)} required>
              {billingOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('contractsForm.statusLabel')}</Label>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setFormError('')
              }}
              required
            >
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-emerald-900">{t('contractsForm.scheduleBlockTitle')}</div>
                <div className="mt-0.5 text-xs text-emerald-800">
                  {t('contractsForm.scheduleBlockDesc')}
                </div>
              </div>
              {!isEdit ? (
                <label className="inline-flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-600"
                    checked={autoSchedule}
                    onChange={(e) => setAutoSchedule(e.target.checked)}
                  />
                  {t('contractsForm.autoGenerateToggle')}
                </label>
              ) : (
                <label className="inline-flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-600"
                    checked={regeneratePending}
                    onChange={(e) => setRegeneratePending(e.target.checked)}
                  />
                  إعادة احتساب وتوليد الدفعات المتبقية
                </label>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{t('contractsForm.installmentsCount')}</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{schedulePreview.count || '—'}</div>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{t('contractsForm.contractMonths')}</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">{schedulePreview.months_total || '—'}</div>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{t('contractsForm.contractTotalValue')}</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">
                  {schedulePreview.total_contract_value ? schedulePreview.total_contract_value.toLocaleString(numberLocale) : '—'}
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{t('contractsForm.averageInstallment')}</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">
                  {schedulePreview.per_installment_rent
                    ? (schedulePreview.per_installment_rent + schedulePreview.per_installment_utility).toLocaleString(numberLocale)
                    : '—'}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-3 py-1.5 font-bold text-emerald-900 ring-1 ring-emerald-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={vatApplicable}
                  onChange={(e) => setVatApplicable(e.target.checked)}
                />
                {t('contractsForm.vatToggle')}
              </label>
              <span className="text-emerald-800">
                {t('contractsForm.currentCycle')}
                <span className="font-extrabold">{t(`billingCycle.${cycle}`, { defaultValue: cycle })}</span>
              </span>
            </div>
            {schedulePreview.installments.length ? (
              <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-emerald-100">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-emerald-100/60 text-start text-[11px] font-extrabold text-emerald-900">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">{t('contractsForm.tableDue')}</th>
                      <th className="px-3 py-2">{t('contractsForm.tableBase')}</th>
                      {vatApplicable ? <th className="px-3 py-2">{t('contractsForm.tableVat')}</th> : null}
                      <th className="px-3 py-2">{t('contractsForm.tableTotal')}</th>
                      <th className="px-3 py-2">{t('contractsForm.tableStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {schedulePreview.installments.slice(0, 6).map((inst) => (
                      <tr key={inst.index} className="border-t border-emerald-50 text-slate-800">
                        <td className="px-3 py-2 font-mono">{inst.index}</td>
                        <td className="px-3 py-2">{inst.due_date}</td>
                        <td className="px-3 py-2 font-mono">{inst.subtotal_amount.toLocaleString(numberLocale)}</td>
                        {vatApplicable ? <td className="px-3 py-2 font-mono">{inst.vat_amount.toLocaleString(numberLocale)}</td> : null}
                        <td className="px-3 py-2 font-mono font-extrabold text-slate-900">{inst.total_amount.toLocaleString(numberLocale)}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                            {t('contractsForm.installmentPending')}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {schedulePreview.installments.length > 6 ? (
                      <tr>
                        <td className="px-3 py-2 text-center text-[11px] font-bold text-slate-500" colSpan={vatApplicable ? 6 : 5}>
                          {t('contractsForm.moreInstallments', { count: schedulePreview.installments.length - 6 })}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-white p-3 text-xs text-emerald-900 ring-1 ring-emerald-100">
                {t('contractsForm.noPreview')}
              </div>
            )}
          </div>

          {formError ? (
            <div className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
              {formError}
            </div>
          ) : null}

          <div className="sm:col-span-2 flex gap-3 border-t border-slate-200 pt-4">
            <Button variant="primary" className={cn('flex-1 transition-transform active:scale-[0.99]')} type="submit" loading={busy}>
              {t('contractsForm.save')}
            </Button>
            <Button variant="subtle" className="flex-1" type="button" onClick={onCancel} disabled={busy}>
              {t('contractsForm.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  )
}
