import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input, Label, Textarea } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { cn } from '../../components/ui/cn'
import { contractFormPayloadSchema, zodFirstIssueMessage } from '../../lib/validation/schemas'

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

/** Units blocked for *new* ساري contracts: another row already ساري on same unit. */
function buildOccupiedUnitMap(existingContracts, excludeContractId) {
  const m = new Map()
  for (const c of existingContracts || []) {
    if (c?.status !== 'ساري') continue
    const uid = contractUnitId(c)
    if (!uid) continue
    if (excludeContractId && c.id === excludeContractId) continue
    const label = c.tenant_full_name || ''
    m.set(uid, label)
  }
  return m
}

export default function ContractForm({ initialValue, tenants, units, existingContracts = [], busy, onSubmit, onCancel }) {
  const { t } = useTranslation()
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
    setUserEditedContractValue(false)
    setFormError('')
    setTenantQ('')
    setUnitQ('')
  }, [initialValue])

  useEffect(() => {
    if (isEdit || userEditedContractValue) return
    const u = (units || []).find((x) => x.id === unitId)
    if (!u || unitId === '') return
    const tr = Number(u.target_rent_value)
    if (!Number.isFinite(tr) || tr < 0) return
    setValue(String(tr))
  }, [unitId, units, isEdit, userEditedContractValue])

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
    return true
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
            <Label>{t('contractsForm.valueLabel')}</Label>
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
            {!isEdit && unitId ? <p className="mt-1 text-[11px] text-slate-500">{t('contractsForm.valueHint')}</p> : null}
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
